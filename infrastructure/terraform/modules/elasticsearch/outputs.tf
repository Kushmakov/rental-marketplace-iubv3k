# Domain name output for resource identification
output "domain_name" {
  value       = aws_elasticsearch_domain.main.domain_name
  description = "The name of the Elasticsearch domain for resource identification and referencing"
  sensitive   = false
}

# Domain ARN output for IAM policies and cross-service integration
output "domain_arn" {
  value       = aws_elasticsearch_domain.main.arn
  description = "The ARN of the Elasticsearch domain for IAM policies and cross-service integration"
  sensitive   = false
}

# Domain endpoint output for service connectivity
output "domain_endpoint" {
  value       = aws_elasticsearch_domain.main.endpoint
  description = "The endpoint URL for secure Elasticsearch API access and data operations"
  sensitive   = false
}

# Kibana endpoint output for monitoring interface
output "kibana_endpoint" {
  value       = aws_elasticsearch_domain.main.kibana_endpoint
  description = "The endpoint URL for Kibana dashboard access and visualization"
  sensitive   = false
}

# CloudWatch log group name output for monitoring integration
output "log_group_name" {
  value       = aws_cloudwatch_log_group.es_log_group.name
  description = "The name of the CloudWatch log group for Elasticsearch logs and monitoring"
  sensitive   = false
}

# CloudWatch log group ARN output for log subscriptions
output "log_group_arn" {
  value       = aws_cloudwatch_log_group.es_log_group.arn
  description = "The ARN of the CloudWatch log group for log subscriptions and IAM policies"
  sensitive   = false
}