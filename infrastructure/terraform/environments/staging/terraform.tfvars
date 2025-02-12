# AWS Region Configuration
aws_region = "us-west-2"

# Environment Identifier
environment = "staging"

# VPC Network Configuration
vpc_cidr = "10.1.0.0/16"
availability_zones = [
  "us-west-2a",
  "us-west-2b",
  "us-west-2c"
]

# EKS Cluster Configuration
eks_cluster_version = "1.27"
eks_node_instance_types = [
  "t3.large",
  "t3.xlarge"
]
eks_desired_capacity = 3

# RDS Database Configuration
db_instance_class = "db.r6g.large"
db_allocated_storage = 200
backup_retention_period = 7
multi_az_enabled = true
monitoring_interval = 60
performance_insights_enabled = true
auto_minor_version_upgrade = true

# Redis Cache Configuration
redis_node_type = "cache.t3.large"
redis_num_cache_nodes = 3

# Elasticsearch Configuration
elasticsearch_instance_type = "t3.large.elasticsearch"
elasticsearch_volume_size = 200