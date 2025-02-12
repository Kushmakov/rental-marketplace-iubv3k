#!/bin/bash

# Secret Rotation Script v1.0
# Requires: aws-cli v2.0+, kubectl v1.27+, jq v1.6+
# Purpose: Automated rotation of infrastructure secrets with enhanced security and compliance

set -euo pipefail

# Global variables
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")
LOG_FILE="/var/log/secret-rotation.log"
SECRETS_TO_ROTATE='["rds-credentials", "jwt-secret", "stripe-webhook-secret", "auth0-client-secret"]'
MAX_RETRIES=3
OPERATION_TIMEOUT=300
CORRELATION_ID=$(uuidgen)
BACKUP_DIR="/var/backup/secrets"

# Enhanced logging function with structured format
log_message() {
    local level="$1"
    local message="$2"
    local additional_context="$3"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    
    local log_entry
    log_entry=$(jq -n \
        --arg ts "$timestamp" \
        --arg lvl "$level" \
        --arg msg "$message" \
        --arg cid "$CORRELATION_ID" \
        --argjson ctx "$additional_context" \
        '{timestamp: $ts, level: $lvl, message: $msg, correlation_id: $cid, context: $ctx}')
    
    echo "$log_entry" | tee -a "$LOG_FILE"
    
    # Rotate log if size exceeds 100MB
    if [[ -f "$LOG_FILE" && $(stat -f%z "$LOG_FILE") -gt 104857600 ]]; then
        mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d-%H%M%S)"
        touch "$LOG_FILE"
        chmod 600 "$LOG_FILE"
    fi
}

# Validate secret against security requirements
validate_secret() {
    local secret_type="$1"
    local secret_value="$2"
    
    # Basic validation
    if [[ -z "$secret_value" ]]; then
        return 1
    fi
    
    case "$secret_type" in
        "rds-credentials")
            # Minimum 16 chars, must contain uppercase, lowercase, number, special char
            [[ "$secret_value" =~ ^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*]).{16,}$ ]] || return 1
            ;;
        "jwt-secret")
            # Minimum 32 chars, base64 encoded
            [[ "$secret_value" =~ ^[A-Za-z0-9+/]{32,}={0,2}$ ]] || return 1
            ;;
        *)
            # Default: minimum 16 chars with mixed case and numbers
            [[ "$secret_value" =~ ^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9]).{16,}$ ]] || return 1
            ;;
    esac
    
    return 0
}

# Rotation execution with retry logic
rotate_with_retry() {
    local secret_name="$1"
    local -r rotation_function="$2"
    local retry_count=0
    local result
    
    while [[ $retry_count -lt $MAX_RETRIES ]]; do
        log_message "INFO" "Attempting rotation for $secret_name" "{\"attempt\": $((retry_count + 1))}"
        
        if result=$(timeout "$OPERATION_TIMEOUT" "$rotation_function" "$secret_name" 2>&1); then
            log_message "INFO" "Rotation successful for $secret_name" "{\"result\": \"success\"}"
            echo "$result"
            return 0
        else
            retry_count=$((retry_count + 1))
            local wait_time=$((2 ** retry_count))
            log_message "WARN" "Rotation failed for $secret_name, retrying in ${wait_time}s" \
                "{\"error\": \"$result\", \"attempt\": $retry_count}"
            sleep "$wait_time"
        fi
    done
    
    log_message "ERROR" "Max retries exceeded for $secret_name" "{\"max_retries\": $MAX_RETRIES}"
    return 1
}

# Create encrypted backup of current secrets
backup_secrets() {
    local backup_timestamp
    backup_timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_path="${BACKUP_DIR}/${backup_timestamp}"
    local metadata_file="${backup_path}/metadata.json"
    
    mkdir -p "$backup_path"
    chmod 700 "$backup_path"
    
    # Export and encrypt current secrets
    local secrets_data
    secrets_data=$(aws secretsmanager list-secrets --query 'SecretList[].Name' --output json)
    
    echo "$secrets_data" | jq -r '.[]' | while read -r secret_name; do
        aws secretsmanager get-secret-value --secret-id "$secret_name" \
            --query 'SecretString' --output text | \
        aws kms encrypt \
            --key-id alias/secret-backup \
            --plaintext fileb:- \
            --output text \
            --query CiphertextBlob > "${backup_path}/${secret_name}.enc"
        
        # Generate checksum
        sha256sum "${backup_path}/${secret_name}.enc" >> "${backup_path}/checksums.sha256"
    done
    
    # Create metadata
    jq -n \
        --arg timestamp "$backup_timestamp" \
        --arg correlation_id "$CORRELATION_ID" \
        '{timestamp: $timestamp, correlation_id: $correlation_id}' > "$metadata_file"
    
    echo "$metadata_file"
}

# Rollback failed rotation
rollback_rotation() {
    local secret_name="$1"
    local backup_metadata="$2"
    
    log_message "INFO" "Initiating rollback for $secret_name" "{\"backup\": \"$backup_metadata\"}"
    
    # Verify backup integrity
    local backup_dir
    backup_dir=$(dirname "$backup_metadata")
    
    if ! (cd "$backup_dir" && sha256sum -c checksums.sha256); then
        log_message "ERROR" "Backup integrity check failed" "{\"secret\": \"$secret_name\"}"
        return 1
    fi
    
    # Restore from backup
    local encrypted_backup="${backup_dir}/${secret_name}.enc"
    if [[ -f "$encrypted_backup" ]]; then
        aws kms decrypt \
            --ciphertext-blob fileb://"$encrypted_backup" \
            --output text \
            --query Plaintext | \
        aws secretsmanager update-secret \
            --secret-id "$secret_name" \
            --secret-string fileb://-
        
        log_message "INFO" "Rollback completed successfully" "{\"secret\": \"$secret_name\"}"
        return 0
    else
        log_message "ERROR" "Backup file not found" "{\"secret\": \"$secret_name\"}"
        return 1
    fi
}

# Main execution function
main() {
    local exit_code=0
    local backup_metadata
    
    log_message "INFO" "Starting secret rotation process" "{\"correlation_id\": \"$CORRELATION_ID\"}"
    
    # Validate environment
    for cmd in aws kubectl jq; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            log_message "ERROR" "Required command not found" "{\"command\": \"$cmd\"}"
            return 1
        fi
    done
    
    # Create backup
    backup_metadata=$(backup_secrets)
    log_message "INFO" "Backup created" "{\"metadata\": \"$backup_metadata\"}"
    
    # Process each secret
    echo "$SECRETS_TO_ROTATE" | jq -r '.[]' | while read -r secret_name; do
        if ! rotate_with_retry "$secret_name" "aws secretsmanager rotate-secret"; then
            log_message "ERROR" "Rotation failed" "{\"secret\": \"$secret_name\"}"
            
            if ! rollback_rotation "$secret_name" "$backup_metadata"; then
                log_message "CRITICAL" "Rollback failed" "{\"secret\": \"$secret_name\"}"
                exit_code=2
            fi
            exit_code=1
            continue
        fi
        
        # Validate new secret
        local new_secret
        new_secret=$(aws secretsmanager get-secret-value --secret-id "$secret_name" --query 'SecretString' --output text)
        if ! validate_secret "$secret_name" "$new_secret"; then
            log_message "ERROR" "New secret validation failed" "{\"secret\": \"$secret_name\"}"
            rollback_rotation "$secret_name" "$backup_metadata"
            exit_code=1
            continue
        fi
    done
    
    # Cleanup old backups (retain last 7 days)
    find "$BACKUP_DIR" -type d -mtime +7 -exec rm -rf {} +
    
    log_message "INFO" "Secret rotation process completed" "{\"status\": $exit_code}"
    return "$exit_code"
}

# Execute main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi