# AWS Region Configuration
variable "aws_region" {
  type        = string
  description = "AWS region for production environment deployment"
  default     = "us-west-2"  # West region for optimal latency and service availability
}

# Environment Configuration
variable "environment" {
  type        = string
  description = "Deployment environment identifier"
  default     = "prod"  # Fixed to prod for production environment
}

# VPC Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for production VPC"
  default     = "10.0.0.0/16"  # Production network space
}

# High Availability Configuration
variable "availability_zones" {
  type        = list(string)
  description = "List of AWS availability zones for production deployment"
  default     = ["us-west-2a", "us-west-2b", "us-west-2c"]  # Mandatory 3-AZ deployment for high availability
}

# EKS Configuration
variable "eks_cluster_version" {
  type        = string
  description = "Kubernetes version for production EKS cluster"
  default     = "1.27"  # Stable production Kubernetes version
}

variable "eks_node_instance_types" {
  type        = list(string)
  description = "Instance types for production EKS worker nodes"
  default     = ["m5.2xlarge", "m5.4xlarge"]  # Production-grade compute optimized instances
}

# RDS Configuration
variable "db_instance_class" {
  type        = string
  description = "RDS instance class for production database"
  default     = "db.r5.2xlarge"  # Memory-optimized instance for high performance
}

# Redis Configuration
variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redis node type for production"
  default     = "cache.r5.xlarge"  # Memory-optimized instance for high throughput caching
}

# Elasticsearch Configuration
variable "elasticsearch_instance_type" {
  type        = string
  description = "Elasticsearch instance type for production"
  default     = "r5.xlarge.elasticsearch"  # Memory-optimized instance for search performance
}