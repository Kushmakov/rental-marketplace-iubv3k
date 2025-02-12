# Development Environment Variables
# Terraform version: 1.5+
# Provider versions:
# - AWS Provider: 5.0+

# Project Name
variable "project_name" {
  type        = string
  description = "Name of the project used for development resource naming and tagging"
  default     = "projectx-dev"
}

# Network Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the development VPC network infrastructure"
  default     = "10.0.0.0/16"
}

# EKS Configuration
variable "eks_node_instance_types" {
  type        = list(string)
  description = "List of instance types for EKS worker nodes in development, optimized for cost and performance"
  default     = ["t3.large"]
}

variable "eks_desired_capacity" {
  type        = number
  description = "Desired number of worker nodes in EKS node group for development environment"
  default     = 2
}

# Database Configuration
variable "db_instance_class" {
  type        = string
  description = "Instance class for RDS PostgreSQL in development environment, balanced for development workloads"
  default     = "db.t3.large"
}

# Cache Configuration
variable "redis_node_type" {
  type        = string
  description = "Instance type for ElastiCache Redis nodes in development, sized for development caching needs"
  default     = "cache.t3.medium"
}

# Search Configuration
variable "elasticsearch_instance_type" {
  type        = string
  description = "Instance type for Elasticsearch nodes in development environment, optimized for development search operations"
  default     = "t3.medium.elasticsearch"
}

# Import common variables from root module
variable "aws_region" {
  type        = string
  description = "AWS region where development resources will be created"
}

variable "environment" {
  type        = string
  description = "Deployment environment identifier"
  validation {
    condition     = var.environment == "dev"
    error_message = "Environment must be 'dev' for development environment"
  }
}

# Local variables for development-specific configurations
locals {
  # Common tags for all development resources
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  # Development-specific resource naming convention
  resource_prefix = "${var.project_name}-${var.environment}"
}