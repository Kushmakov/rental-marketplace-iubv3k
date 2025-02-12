# Input variables for VPC module that creates secure and scalable network infrastructure
# with public and private subnets across multiple availability zones

variable "project_name" {
  type        = string
  description = "Name of the project used for resource naming and tagging. Must follow naming convention."
  
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name)) && length(var.project_name) <= 32
    error_message = "Project name must contain only lowercase letters, numbers, hyphens and be 32 characters or less"
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment identifier used for resource isolation and configuration"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC network. Must be /16 to support subnet allocation strategy"
  default     = "10.0.0.0/16"
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && split("/", var.vpc_cidr)[1] == "16"
    error_message = "VPC CIDR must be a valid /16 CIDR block"
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "List of AWS availability zones for multi-AZ deployment. Minimum 2 zones required"
  
  validation {
    condition     = length(var.availability_zones) >= 2 && alltrue([for az in var.availability_zones : can(regex("^[a-z]{2}-[a-z]+-\\d[a-z]$", az))])
    error_message = "Minimum 2 availability zones required in format: region-az (e.g., us-east-1a)"
  }
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Enable NAT Gateway for private subnet internet access. Incurs additional costs"
  default     = true
}

variable "tags" {
  type        = map(string)
  description = "Additional resource tags. Must include required tags: Owner, CostCenter"
  default     = {}
  
  validation {
    condition     = can(lookup(var.tags, "Owner", null)) && can(lookup(var.tags, "CostCenter", null))
    error_message = "Tags must include 'Owner' and 'CostCenter' keys"
  }
}