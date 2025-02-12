# Core Terraform functionality for variable definitions and validation blocks
terraform {
  required_version = "~> 1.5"
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where Redis cluster will be deployed"

  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must start with 'vpc-'."
  }
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for Redis cluster deployment across multiple AZs"

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets must be provided for high availability."
  }

  validation {
    condition     = can([for s in var.private_subnet_ids : regex("^subnet-", s)])
    error_message = "All subnet IDs must start with 'subnet-'."
  }
}

variable "environment" {
  type        = string
  description = "Environment name for resource naming and tagging (e.g. dev, staging, prod)"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "redis_node_type" {
  type        = string
  description = "Instance type for Redis nodes with recommended types for each environment"
  default     = "cache.t4g.medium"

  validation {
    condition     = can(regex("^cache\\.[a-z0-9]+\\.[a-z0-9]+$", var.redis_node_type))
    error_message = "Redis node type must be a valid cache instance type (e.g. cache.t4g.medium)."
  }
}

variable "redis_num_cache_nodes" {
  type        = number
  description = "Number of nodes in Redis cluster (minimum 2 for HA)"
  default     = 2

  validation {
    condition     = var.redis_num_cache_nodes >= 2
    error_message = "Redis cluster must have at least 2 nodes for high availability."
  }
}

variable "redis_version" {
  type        = string
  description = "Redis engine version"
  default     = "7.0"
}

variable "allowed_cidr_blocks" {
  type        = list(string)
  description = "List of CIDR blocks allowed to access Redis cluster"

  validation {
    condition     = can([for cidr in var.allowed_cidr_blocks : regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", cidr)])
    error_message = "All CIDR blocks must be in valid IPv4 CIDR notation (e.g. 10.0.0.0/16)."
  }
}

variable "maintenance_window" {
  type        = string
  description = "Weekly time range for system maintenance (UTC)"
  default     = "sun:05:00-sun:06:00"

  validation {
    condition     = can(regex("^(mon|tue|wed|thu|fri|sat|sun):[0-9]{2}:[0-9]{2}-(mon|tue|wed|thu|fri|sat|sun):[0-9]{2}:[0-9]{2}$", var.maintenance_window))
    error_message = "Maintenance window must be in the format day:hour:minute-day:hour:minute (e.g. sun:05:00-sun:06:00)."
  }
}

variable "snapshot_retention_limit" {
  type        = number
  description = "Number of days to retain Redis backups (0-35 days)"
  default     = 7

  validation {
    condition     = var.snapshot_retention_limit >= 0 && var.snapshot_retention_limit <= 35
    error_message = "Snapshot retention limit must be between 0 and 35 days."
  }
}

variable "at_rest_encryption_enabled" {
  type        = bool
  description = "Enable encryption at rest for Redis cluster"
  default     = true
}

variable "transit_encryption_enabled" {
  type        = bool
  description = "Enable encryption in transit for Redis cluster"
  default     = true
}