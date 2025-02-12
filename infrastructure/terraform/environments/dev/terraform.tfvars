# AWS Region Configuration
aws_region = "us-west-2"

# Environment Identifier
environment = "dev"

# Project Configuration
project_name = "projectx"

# Network Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-west-2a", "us-west-2b"]

# EKS Cluster Configuration
eks_cluster_version = "1.27"
eks_node_instance_types = ["t3.large"]
eks_desired_capacity = 2

# Database Configuration - Cost-optimized for development
db_instance_class = "db.t3.large"
db_allocated_storage = 50

# Redis Configuration - Minimal HA for development
redis_node_type = "cache.t3.medium"
redis_num_cache_nodes = 2

# Elasticsearch Configuration - Development sizing
elasticsearch_instance_type = "t3.medium.elasticsearch"
elasticsearch_volume_size = 50