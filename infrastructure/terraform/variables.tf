# AWS Region Configuration
variable "aws_region" {
  type        = string
  description = "AWS region where resources will be created"
  default     = "us-west-2"
}

# Environment Configuration
variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# VPC Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC"
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones to deploy resources in"
}

# EKS Configuration
variable "eks_cluster_version" {
  type        = string
  description = "Kubernetes version for the EKS cluster"
  default     = "1.27"
}

variable "eks_node_instance_types" {
  type        = list(string)
  description = "List of instance types for EKS worker nodes"
  default     = ["t3.large", "t3.xlarge"]
}

variable "eks_desired_capacity" {
  type        = number
  description = "Desired number of worker nodes in EKS node group"
  default     = 3
}

# RDS Configuration
variable "db_instance_class" {
  type        = string
  description = "Instance class for RDS PostgreSQL"
  default     = "db.t3.large"
}

variable "db_allocated_storage" {
  type        = number
  description = "Allocated storage for RDS in GB"
  default     = 100
}

# Redis Configuration
variable "redis_node_type" {
  type        = string
  description = "Instance type for ElastiCache Redis nodes"
  default     = "cache.t3.medium"
}

variable "redis_num_cache_nodes" {
  type        = number
  description = "Number of cache nodes in the Redis cluster"
  default     = 2
}

# Elasticsearch Configuration
variable "elasticsearch_instance_type" {
  type        = string
  description = "Instance type for Elasticsearch nodes"
  default     = "t3.medium.elasticsearch"
}

variable "elasticsearch_volume_size" {
  type        = number
  description = "Size of EBS volumes attached to Elasticsearch nodes in GB"
  default     = 100
}