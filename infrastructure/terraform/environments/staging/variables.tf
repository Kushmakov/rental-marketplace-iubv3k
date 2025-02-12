# Project Configuration
variable "project_name" {
  type        = string
  description = "Project identifier for resource naming and tagging in staging environment"
  default     = "projectx"
}

# Environment Configuration
variable "environment" {
  type        = string
  description = "Environment identifier fixed to staging"
  default     = "staging"
}

# AWS Region Configuration
variable "aws_region" {
  type        = string
  description = "AWS region for staging environment deployment"
  default     = "us-west-2"
}

# Network Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for staging VPC network"
  default     = "10.1.0.0/16"  # Distinct from production CIDR
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones for dual-AZ staging deployment"
  default     = ["us-west-2a", "us-west-2b"]
}

# EKS Configuration
variable "eks_node_instance_types" {
  type        = list(string)
  description = "Cost-optimized instance types for staging EKS worker nodes"
  default     = ["t3.large"]  # Cost-optimized compared to production
}

variable "eks_desired_capacity" {
  type        = number
  description = "Desired number of worker nodes in staging EKS cluster"
  default     = 2  # Reduced capacity for staging
}

# RDS Configuration
variable "db_instance_class" {
  type        = string
  description = "Instance class for staging RDS PostgreSQL database"
  default     = "db.r6g.large"  # Balanced performance and cost
}

# Redis Configuration
variable "redis_node_type" {
  type        = string
  description = "Instance type for staging ElastiCache Redis cluster"
  default     = "cache.t3.medium"  # Right-sized for staging workloads
}

# Elasticsearch Configuration
variable "elasticsearch_instance_type" {
  type        = string
  description = "Instance type for staging Elasticsearch cluster"
  default     = "t3.medium.elasticsearch"  # Appropriate for staging search volume
}