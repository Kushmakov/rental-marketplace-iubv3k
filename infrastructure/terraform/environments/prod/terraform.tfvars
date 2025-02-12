# Production environment configuration for rental marketplace platform
# Defines high-availability infrastructure deployment across multiple AZs

# AWS Region Configuration
aws_region = "us-west-2"
environment = "prod"

# Project Information
project_name = "rental-marketplace"

# VPC Network Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]
enable_nat_gateway = true

# EKS Cluster Configuration
eks_cluster_version = "1.27"
eks_node_instance_types = ["t3.xlarge", "t3.2xlarge"]
eks_desired_capacity = 5

# RDS Database Configuration
db_instance_class = "db.r6g.xlarge"
db_allocated_storage = 500

# Redis Cache Configuration
redis_node_type = "cache.r6g.large"
redis_num_cache_nodes = 3

# Elasticsearch Configuration
elasticsearch_instance_type = "r6g.large.elasticsearch"
elasticsearch_volume_size = 500

# Resource Tags
tags = {
  Environment = "production"
  Project = "rental-marketplace"
  ManagedBy = "terraform"
  Owner = "platform-team"
  CostCenter = "platform-prod"
  Compliance = "pci-dss"
  Backup = "daily"
  BusinessUnit = "marketplace"
}