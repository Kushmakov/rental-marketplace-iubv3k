# Input variables for EKS module that configures and manages Amazon EKS clusters
# with associated resources for container orchestration

variable "project_name" {
  type        = string
  description = "Name of the project for resource naming and tagging"
  
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens"
  }
}

variable "environment" {
  type        = string
  description = "Environment name (e.g., dev, staging, prod) for resource isolation"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where EKS cluster will be deployed"
  
  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must begin with 'vpc-'"
  }
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for EKS node groups"
  
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets required for high availability"
  }
}

variable "cluster_version" {
  type        = string
  description = "Kubernetes version for the EKS cluster (must be 1.27 or higher)"
  default     = "1.27"
  
  validation {
    condition     = can(regex("^1\\.(2[7-9]|[3-9][0-9])", var.cluster_version))
    error_message = "Cluster version must be 1.27 or higher"
  }
}

variable "node_instance_types" {
  type        = list(string)
  description = "List of EC2 instance types for EKS node groups (must be EKS-supported types)"
  default     = ["t3.xlarge", "t3.2xlarge"]
  
  validation {
    condition     = alltrue([for t in var.node_instance_types : contains(["t3.xlarge", "t3.2xlarge", "m5.xlarge", "m5.2xlarge", "c5.xlarge", "c5.2xlarge"], t)])
    error_message = "Instance types must be from the approved EKS-supported list"
  }
}

variable "node_desired_size" {
  type        = number
  description = "Desired number of nodes in the EKS node group"
  default     = 3
  
  validation {
    condition     = var.node_desired_size >= var.node_min_size && var.node_desired_size <= var.node_max_size
    error_message = "Desired size must be between min and max sizes"
  }
}

variable "node_min_size" {
  type        = number
  description = "Minimum number of nodes in the EKS node group"
  default     = 2
  
  validation {
    condition     = var.node_min_size >= 2
    error_message = "Minimum size must be at least 2 for high availability"
  }
}

variable "node_max_size" {
  type        = number
  description = "Maximum number of nodes in the EKS node group"
  default     = 10
  
  validation {
    condition     = var.node_max_size <= 20
    error_message = "Maximum size cannot exceed 20 nodes"
  }
}

variable "endpoint_private_access" {
  type        = bool
  description = "Whether to enable private API server endpoint access (recommended for security)"
  default     = true
  
  validation {
    condition     = var.endpoint_private_access == true
    error_message = "Private endpoint access must be enabled for security"
  }
}

variable "endpoint_public_access" {
  type        = bool
  description = "Whether to enable public API server endpoint access (disabled by default for security)"
  default     = false
}

variable "cluster_log_types" {
  type        = list(string)
  description = "List of the desired control plane logging to enable (all logs enabled by default for security)"
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  
  validation {
    condition     = length(setsubtract(["api", "audit", "authenticator", "controllerManager", "scheduler"], var.cluster_log_types)) == 0
    error_message = "All control plane log types must be enabled for security compliance"
  }
}

variable "cluster_encryption_config" {
  type        = bool
  description = "Whether to enable envelope encryption for Kubernetes secrets using AWS KMS"
  default     = true
  
  validation {
    condition     = var.cluster_encryption_config == true
    error_message = "Cluster encryption must be enabled for security compliance"
  }
}