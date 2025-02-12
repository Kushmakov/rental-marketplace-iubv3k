# Output definitions for Redis cluster configuration
# Terraform version: ~> 1.5

output "redis_primary_endpoint" {
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  description = "Primary endpoint address for Redis cluster write operations and cluster management, supporting high availability with automatic failover"
}

output "redis_reader_endpoint" {
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
  description = "Reader endpoint address for Redis cluster read operations, optimized for read scaling and high availability"
}

output "redis_security_group_id" {
  value       = aws_security_group.redis.id
  description = "ID of the security group controlling Redis cluster access, ensuring secure network-level access control"
}

output "redis_port" {
  value       = 6379
  description = "Standard port number for connecting to the Redis cluster, must be used in conjunction with security group rules"
}