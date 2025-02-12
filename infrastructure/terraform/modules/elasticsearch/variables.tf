# Project name variable used for resource naming
variable "project_name" {
  type        = string
  description = "Name of the project used to form the Elasticsearch domain name and resource naming convention"
  default     = "projectx"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
  }
}

# Environment identifier for deployment configuration
variable "environment" {
  type        = string
  description = "Deployment environment identifier used for resource naming and configuration selection"

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

# Elasticsearch version configuration
variable "elasticsearch_version" {
  type        = string
  description = "Version of Elasticsearch to deploy, must be compatible with AWS Elasticsearch Service"
  default     = "8.9"

  validation {
    condition     = can(regex("^[0-9]\\.[0-9]$", var.elasticsearch_version))
    error_message = "Elasticsearch version must be in format X.Y"
  }
}

# Instance type for Elasticsearch nodes
variable "instance_type" {
  type        = string
  description = "EC2 instance type for Elasticsearch nodes, must support Elasticsearch workloads"
  default     = "r6g.xlarge.elasticsearch"

  validation {
    condition     = can(regex("^[a-z][0-9][a-z]\\.(xlarge|2xlarge|4xlarge|8xlarge|12xlarge)\\.elasticsearch$", var.instance_type))
    error_message = "Instance type must be a valid Elasticsearch-compatible instance type."
  }
}

# Cluster size configuration
variable "instance_count" {
  type        = number
  description = "Number of instances in the Elasticsearch cluster for high availability and performance"
  default     = 3

  validation {
    condition     = var.instance_count >= 3 && var.instance_count % 2 != 0
    error_message = "Instance count must be at least 3 and an odd number for proper quorum."
  }
}

# Storage configuration
variable "volume_size" {
  type        = number
  description = "Size of EBS volumes attached to data nodes in GB, must account for data growth"
  default     = 100

  validation {
    condition     = var.volume_size >= 100 && var.volume_size <= 16384
    error_message = "Volume size must be between 100GB and 16384GB."
  }
}

# Network configuration
variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs where Elasticsearch nodes will be deployed, must be in different AZs"

  validation {
    condition     = length(var.subnet_ids) >= 3
    error_message = "At least 3 subnet IDs are required for multi-AZ deployment."
  }
}

# Security configuration
variable "security_group_ids" {
  type        = list(string)
  description = "List of security group IDs to control network access to the Elasticsearch domain"

  validation {
    condition     = length(var.security_group_ids) > 0
    error_message = "At least one security group ID is required."
  }
}

# Backup configuration
variable "automated_snapshot_start_hour" {
  type        = number
  description = "Hour during which automated snapshots are taken, coordinated with backup strategy"
  default     = 3

  validation {
    condition     = var.automated_snapshot_start_hour >= 0 && var.automated_snapshot_start_hour <= 23
    error_message = "Snapshot hour must be between 0 and 23."
  }
}

# Logging configuration
variable "log_retention_days" {
  type        = number
  description = "Number of days to retain Elasticsearch logs in CloudWatch for audit and troubleshooting"
  default     = 30

  validation {
    condition     = var.log_retention_days >= 7 && var.log_retention_days <= 365
    error_message = "Log retention must be between 7 and 365 days."
  }
}

# Encryption configuration
variable "enable_encryption" {
  type        = bool
  description = "Enable encryption at rest using AWS KMS for enhanced security"
  default     = true
}

variable "kms_key_id" {
  type        = string
  description = "KMS key ID for encryption at rest when enable_encryption is true"
  default     = null
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Tags to apply to all resources created by this module for resource management"
  default     = {}
}