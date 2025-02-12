# Output values for RDS Aurora PostgreSQL cluster
# Defines essential connection details, security configurations, and monitoring information

output "cluster_endpoint" {
  description = "Writer endpoint for the RDS cluster"
  value       = aws_rds_cluster.main.endpoint
  sensitive   = true
}

output "reader_endpoint" {
  description = "Reader endpoint for the RDS cluster"
  value       = aws_rds_cluster.main.reader_endpoint
  sensitive   = true
}

output "port" {
  description = "Port number for database connections"
  value       = aws_rds_cluster.main.port
}

output "cluster_identifier" {
  description = "Unique identifier for the RDS cluster"
  value       = aws_rds_cluster.main.cluster_identifier
}

output "cluster_arn" {
  description = "ARN of the RDS cluster for IAM policies"
  value       = aws_rds_cluster.main.arn
}

output "security_group_id" {
  description = "ID of the security group controlling database access"
  value       = aws_security_group.rds.id
  sensitive   = true
}

output "security_group_arn" {
  description = "ARN of the security group for IAM policies"
  value       = aws_security_group.rds.arn
}

output "subnet_group_name" {
  description = "Name of the DB subnet group"
  value       = aws_db_subnet_group.main.name
}

output "subnet_group_arn" {
  description = "ARN of the DB subnet group for IAM policies"
  value       = aws_db_subnet_group.main.arn
}

output "backup_retention_period" {
  description = "Number of days to retain automated backups"
  value       = aws_rds_cluster.main.backup_retention_period
}