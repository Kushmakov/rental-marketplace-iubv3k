terraform {
  required_version = ">=1.5.0"
}

variable "project_name" {
  type        = string
  description = "Name of the project used for resource naming"
  default     = "projectx"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where RDS cluster will be deployed"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block for security group rules"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for RDS subnet group"
}

variable "database_name" {
  type        = string
  description = "Name of the initial database to be created"
}

variable "master_username" {
  type        = string
  description = "Master username for the RDS cluster"
  sensitive   = true
}

variable "master_password" {
  type        = string
  description = "Master password for the RDS cluster"
  sensitive   = true
}

variable "instance_class" {
  type        = string
  description = "Instance class for RDS cluster instances"
  default     = "db.r6g.large"
}

variable "instance_count" {
  type        = number
  description = "Number of RDS instances in the cluster"
  default     = 3
  validation {
    condition     = var.instance_count >= 2
    error_message = "At least 2 instances required for high availability"
  }
}

variable "backup_retention_period" {
  type        = number
  description = "Number of days to retain automated backups"
  default     = 14
  validation {
    condition     = var.backup_retention_period >= 7
    error_message = "Backup retention period must be at least 7 days"
  }
}

variable "preferred_backup_window" {
  type        = string
  description = "Daily time range for automated backups"
  default     = "03:00-04:00"
}

variable "preferred_maintenance_window" {
  type        = string
  description = "Weekly time range for maintenance"
  default     = "mon:04:00-mon:05:00"
}

variable "monitoring_interval" {
  type        = number
  description = "Enhanced monitoring interval in seconds"
  default     = 60
  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "Monitoring interval must be one of: 0, 1, 5, 10, 15, 30, 60"
  }
}

variable "performance_insights_enabled" {
  type        = bool
  description = "Enable Performance Insights for monitoring"
  default     = true
}

variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection for the RDS cluster"
  default     = true
}

variable "skip_final_snapshot" {
  type        = bool
  description = "Determines whether a final snapshot is created before deletion"
  default     = false
}

variable "apply_immediately" {
  type        = bool
  description = "Specifies whether modifications are applied immediately"
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for RDS resources"
  default     = {}
}