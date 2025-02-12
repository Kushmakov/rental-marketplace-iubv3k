#!/bin/bash

# Database Backup Script for Project X
# Version: 1.0.0
# AWS CLI Version: 2.x
# MongoDB Tools Version: 100.x

set -euo pipefail
IFS=$'\n\t'

# Global Variables
BACKUP_ROOT="/mnt/backups"
RETENTION_DAYS=7
S3_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/database-backups.log"
SNS_TOPIC_ARN="${PROJECT_NAME}-${ENVIRONMENT}-backup-notifications"
CROSS_REGION_BUCKET="${PROJECT_NAME}-${ENVIRONMENT}-dr-backups"
MAX_PARALLEL_UPLOADS=5

# Logging function with timestamps
log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

# Function decorator for AWS credential validation
requires_aws_credentials() {
    if ! aws sts get-caller-identity &>/dev/null; then
        log "ERROR" "Invalid or missing AWS credentials"
        return 1
    fi
}

# Function decorator for MongoDB connection validation
requires_mongodb_connection() {
    if ! mongosh --eval "db.adminCommand('ping')" &>/dev/null; then
        log "ERROR" "Invalid or missing MongoDB connection"
        return 1
    fi
}

# Backup PostgreSQL Aurora cluster
backup_postgres() {
    log "INFO" "Starting PostgreSQL backup process"
    
    # Get cluster details
    local cluster_id
    cluster_id=$(aws rds describe-db-clusters --query 'DBClusters[0].DBClusterIdentifier' --output text)
    
    # Create snapshot with encryption
    local snapshot_id="${cluster_id}-${TIMESTAMP}"
    log "INFO" "Creating encrypted snapshot: $snapshot_id"
    
    aws rds create-db-cluster-snapshot \
        --db-cluster-identifier "$cluster_id" \
        --db-cluster-snapshot-identifier "$snapshot_id" \
        --tags Key=BackupType,Value=Automated Key=Timestamp,Value="$TIMESTAMP"
    
    # Monitor snapshot creation
    while true; do
        status=$(aws rds describe-db-cluster-snapshots \
            --db-cluster-snapshot-identifier "$snapshot_id" \
            --query 'DBClusterSnapshots[0].Status' \
            --output text)
        
        if [ "$status" = "available" ]; then
            break
        elif [ "$status" = "failed" ]; then
            log "ERROR" "Snapshot creation failed"
            send_notification "postgres" "failed" "Snapshot creation failed" "{}"
            return 1
        fi
        sleep 30
    done
    
    # Verify snapshot
    if ! verify_backup_integrity "postgres" "$snapshot_id"; then
        log "ERROR" "Snapshot verification failed"
        send_notification "postgres" "failed" "Snapshot verification failed" "{}"
        return 1
    fi
    
    # Copy to DR region
    local dr_snapshot_id="${snapshot_id}-dr"
    aws rds copy-db-cluster-snapshot \
        --source-db-cluster-snapshot-identifier "$snapshot_id" \
        --target-db-cluster-snapshot-identifier "$dr_snapshot_id" \
        --kms-key-id "$(aws kms describe-key --key-id alias/aws/rds --query 'KeyMetadata.Arn' --output text)" \
        --region "$DR_REGION"
    
    # Cleanup old snapshots
    cleanup_old_backups "postgres" "primary"
    cleanup_old_backups "postgres" "$DR_REGION"
    
    # Send success notification
    local metrics="{\"size\": \"$(aws rds describe-db-cluster-snapshots --db-cluster-snapshot-identifier "$snapshot_id" --query 'DBClusterSnapshots[0].AllocatedStorage' --output text)\", \"duration\": \"$SECONDS\"}"
    send_notification "postgres" "success" "Backup completed successfully" "$metrics"
    
    log "INFO" "PostgreSQL backup completed successfully"
    return 0
}

# Backup MongoDB databases
backup_mongodb() {
    log "INFO" "Starting MongoDB backup process"
    
    local backup_dir="${BACKUP_ROOT}/mongodb/${TIMESTAMP}"
    mkdir -p "$backup_dir"
    
    # Run mongodump with compression and encryption
    mongodump \
        --uri="$MONGODB_URI" \
        --out="$backup_dir" \
        --gzip \
        --oplog \
        --numParallelCollections=4
    
    if [ $? -ne 0 ]; then
        log "ERROR" "MongoDB dump failed"
        send_notification "mongodb" "failed" "Backup creation failed" "{}"
        return 1
    }
    
    # Calculate backup size and checksum
    local backup_size
    backup_size=$(du -sh "$backup_dir" | cut -f1)
    local checksum
    checksum=$(find "$backup_dir" -type f -exec md5sum {} + | sort -k 2 | md5sum | cut -d' ' -f1)
    
    # Upload to S3 with parallel processing
    log "INFO" "Uploading backup to S3"
    find "$backup_dir" -type f -print0 | xargs -0 -n1 -P"$MAX_PARALLEL_UPLOADS" -I{} \
        aws s3 cp {} "s3://${S3_BUCKET}/mongodb/${TIMESTAMP}/" \
        --storage-class STANDARD_IA \
        --server-side-encryption aws:kms
    
    # Replicate to DR bucket
    aws s3 sync \
        "s3://${S3_BUCKET}/mongodb/${TIMESTAMP}/" \
        "s3://${CROSS_REGION_BUCKET}/mongodb/${TIMESTAMP}/" \
        --source-region "$AWS_REGION" \
        --region "$DR_REGION"
    
    # Verify backup integrity
    if ! verify_backup_integrity "mongodb" "$TIMESTAMP"; then
        log "ERROR" "Backup verification failed"
        send_notification "mongodb" "failed" "Backup verification failed" "{}"
        return 1
    }
    
    # Cleanup
    rm -rf "$backup_dir"
    cleanup_old_backups "mongodb" "primary"
    cleanup_old_backups "mongodb" "$DR_REGION"
    
    # Send success notification
    local metrics="{\"size\": \"$backup_size\", \"checksum\": \"$checksum\", \"duration\": \"$SECONDS\"}"
    send_notification "mongodb" "success" "Backup completed successfully" "$metrics"
    
    log "INFO" "MongoDB backup completed successfully"
    return 0
}

# Cleanup old backups
cleanup_old_backups() {
    local backup_type=$1
    local region=$2
    
    log "INFO" "Starting cleanup of old $backup_type backups in $region"
    
    local cutoff_date
    cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y%m%d)
    
    if [ "$backup_type" = "postgres" ]; then
        aws rds describe-db-cluster-snapshots \
            --region "$region" \
            --query "DBClusterSnapshots[?SnapshotCreateTime<='${cutoff_date}'].[DBClusterSnapshotIdentifier]" \
            --output text | while read -r snapshot; do
            aws rds delete-db-cluster-snapshot \
                --db-cluster-snapshot-identifier "$snapshot" \
                --region "$region"
        done
    else
        aws s3 rm \
            "s3://${S3_BUCKET}/${backup_type}/" \
            --recursive \
            --region "$region" \
            --exclude "*" \
            --include "*" \
            --older-than "$RETENTION_DAYS"
    fi
    
    log "INFO" "Cleanup completed for $backup_type in $region"
}

# Verify backup integrity
verify_backup_integrity() {
    local backup_type=$1
    local backup_id=$2
    
    log "INFO" "Verifying $backup_type backup: $backup_id"
    
    if [ "$backup_type" = "postgres" ]; then
        # Verify RDS snapshot
        local snapshot_status
        snapshot_status=$(aws rds describe-db-cluster-snapshots \
            --db-cluster-snapshot-identifier "$backup_id" \
            --query 'DBClusterSnapshots[0].Status' \
            --output text)
        
        [ "$snapshot_status" = "available" ]
        return $?
    else
        # Verify MongoDB backup
        local s3_objects
        s3_objects=$(aws s3 ls "s3://${S3_BUCKET}/${backup_type}/${backup_id}/" --recursive)
        
        if [ -z "$s3_objects" ]; then
            return 1
        fi
        
        # Verify checksums
        local original_checksum
        original_checksum=$(aws s3 cp "s3://${S3_BUCKET}/${backup_type}/${backup_id}/checksum.md5" -)
        local current_checksum
        current_checksum=$(aws s3 ls "s3://${S3_BUCKET}/${backup_type}/${backup_id}/" --recursive | md5sum | cut -d' ' -f1)
        
        [ "$original_checksum" = "$current_checksum" ]
        return $?
    fi
}

# Send notification
send_notification() {
    local backup_type=$1
    local status=$2
    local message=$3
    local metrics=$4
    
    local notification
    notification=$(cat <<EOF
{
    "backup_type": "$backup_type",
    "status": "$status",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "message": "$message",
    "metrics": $metrics
}
EOF
)
    
    aws sns publish \
        --topic-arn "$SNS_TOPIC_ARN" \
        --message "$notification"
}

# Main execution
main() {
    log "INFO" "Starting database backup process"
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_ROOT"
    
    # Run PostgreSQL backup
    if ! backup_postgres; then
        log "ERROR" "PostgreSQL backup failed"
    fi
    
    # Run MongoDB backup
    if ! backup_mongodb; then
        log "ERROR" "MongoDB backup failed"
    fi
    
    log "INFO" "Database backup process completed"
}

# Execute main function
main "$@"