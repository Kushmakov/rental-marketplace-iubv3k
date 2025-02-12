terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0.0"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  tags = merge(
    {
      Name        = "${local.name_prefix}-aurora"
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "terraform"
    },
    var.tags
  )
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-rds-subnet-group"
  subnet_ids = var.private_subnet_ids
  tags       = local.tags
}

# Security Group
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Security group for RDS Aurora cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    cidr_blocks     = [var.vpc_cidr]
    description     = "Allow PostgreSQL traffic from VPC"
  }

  egress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]
    description     = "Allow all outbound traffic"
  }

  tags = local.tags
}

# KMS Key for encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS cluster encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.name_prefix}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# IAM Role for Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name_prefix}-rds-monitoring-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Aurora PostgreSQL Cluster
resource "aws_rds_cluster" "main" {
  cluster_identifier        = "${local.name_prefix}-aurora-cluster"
  engine                   = "aurora-postgresql"
  engine_version           = "15.3"
  database_name            = var.database_name
  master_username          = var.master_username
  master_password          = var.master_password
  db_subnet_group_name     = aws_db_subnet_group.main.name
  vpc_security_group_ids   = [aws_security_group.rds.id]
  
  storage_encrypted        = true
  kms_key_id              = aws_kms_key.rds.arn
  
  backup_retention_period  = var.backup_retention_period
  preferred_backup_window = var.preferred_backup_window
  preferred_maintenance_window = var.preferred_maintenance_window
  
  skip_final_snapshot     = var.skip_final_snapshot
  final_snapshot_identifier = "${local.name_prefix}-final-snapshot"
  deletion_protection     = var.deletion_protection
  
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  apply_immediately      = var.apply_immediately
  copy_tags_to_snapshot = true
  
  iam_database_authentication_enabled = true
  
  tags = local.tags
}

# Aurora PostgreSQL Instances
resource "aws_rds_cluster_instance" "main" {
  count                   = var.instance_count
  identifier             = "${local.name_prefix}-aurora-instance-${count.index + 1}"
  cluster_identifier     = aws_rds_cluster.main.id
  instance_class         = var.instance_class
  engine                 = aws_rds_cluster.main.engine
  engine_version         = aws_rds_cluster.main.engine_version
  
  publicly_accessible    = false
  auto_minor_version_upgrade = true
  
  monitoring_interval    = var.monitoring_interval
  monitoring_role_arn    = aws_iam_role.rds_monitoring.arn
  
  performance_insights_enabled = var.performance_insights_enabled
  performance_insights_retention_period = 7
  
  promotion_tier         = count.index + 1
  
  tags = local.tags
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "${local.name_prefix}-aurora-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.main.cluster_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "free_storage" {
  alarm_name          = "${local.name_prefix}-aurora-free-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "20000000000"  # 20GB in bytes
  alarm_description   = "This metric monitors RDS free storage space"
  alarm_actions       = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.main.cluster_identifier
  }
}

# Outputs
output "cluster_endpoint" {
  description = "Writer endpoint for the cluster"
  value       = aws_rds_cluster.main.endpoint
}

output "reader_endpoint" {
  description = "Reader endpoint for the cluster"
  value       = aws_rds_cluster.main.reader_endpoint
}

output "port" {
  description = "Port number for the cluster"
  value       = aws_rds_cluster.main.port
}

output "security_group_id" {
  description = "ID of the security group"
  value       = aws_security_group.rds.id
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for encryption"
  value       = aws_kms_key.rds.arn
}