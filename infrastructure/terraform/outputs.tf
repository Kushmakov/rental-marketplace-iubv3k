# Output configuration for AWS infrastructure resources
# Defines critical endpoints and IDs needed for system integration
# while maintaining security best practices through sensitive flags

# VPC Outputs
output "vpc_id" {
  value       = module.vpc.vpc_id
  description = "The ID of the VPC created for the rental marketplace platform infrastructure"
}

output "private_subnet_ids" {
  value       = module.vpc.private_subnet_ids
  description = "List of private subnet IDs where secure workloads are deployed"
}

output "public_subnet_ids" {
  value       = module.vpc.public_subnet_ids
  description = "List of public subnet IDs where internet-facing resources are deployed"
}

# EKS Cluster Outputs
output "eks_cluster_endpoint" {
  value       = module.eks.cluster_endpoint
  description = "The endpoint URL for accessing the EKS cluster API server"
  sensitive   = true
}

output "eks_cluster_name" {
  value       = module.eks.cluster_name
  description = "The name of the EKS cluster for resource identification and access"
}

output "eks_cluster_certificate_authority_data" {
  value       = module.eks.cluster_certificate_authority_data
  description = "The base64 encoded certificate data required for cluster authentication"
  sensitive   = true
}

# RDS Database Outputs
output "rds_endpoint" {
  value       = module.rds.db_endpoint
  description = "The connection endpoint for the PostgreSQL RDS database instance"
  sensitive   = true
}

# Redis Cache Outputs
output "redis_endpoint" {
  value       = module.elasticache.redis_endpoint
  description = "The connection endpoint for the Redis ElastiCache cluster"
  sensitive   = true
}

# Elasticsearch Outputs
output "elasticsearch_endpoint" {
  value       = module.elasticsearch.elasticsearch_endpoint
  description = "The connection endpoint for the Elasticsearch cluster"
  sensitive   = true
}