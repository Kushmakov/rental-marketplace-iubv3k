# AWS Provider configuration is expected to be defined in the root module
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for resource naming and configuration
locals {
  domain_name     = "${var.project_name}-${var.environment}-es"
  log_group_name  = "/aws/elasticsearch/${var.project_name}-${var.environment}-es"
  kms_key_alias   = "alias/${var.project_name}-${var.environment}-es-key"
}

# KMS key for encryption at rest
resource "aws_kms_key" "es_encryption_key" {
  description             = "KMS key for Elasticsearch encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = var.tags
}

# KMS key alias for easier reference
resource "aws_kms_alias" "es_encryption_key_alias" {
  name          = local.kms_key_alias
  target_key_id = aws_kms_key.es_encryption_key.key_id
}

# CloudWatch Log Group for Elasticsearch logs
resource "aws_cloudwatch_log_group" "es_log_group" {
  name              = local.log_group_name
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.es_encryption_key.arn
  tags              = var.tags
}

# Elasticsearch domain configuration
resource "aws_elasticsearch_domain" "main" {
  domain_name           = local.domain_name
  elasticsearch_version = var.elasticsearch_version

  cluster_config {
    instance_type            = var.instance_type
    instance_count          = var.instance_count
    zone_awareness_enabled  = true
    
    zone_awareness_config {
      availability_zone_count = 3
    }

    dedicated_master_enabled = true
    dedicated_master_count   = 3
    dedicated_master_type    = var.instance_type

    warm_enabled = true
    warm_count   = 2
    warm_type    = "ultrawarm1.medium.elasticsearch"
  }

  vpc_options {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  ebs_options {
    ebs_enabled = true
    volume_size = var.volume_size
    volume_type = "gp3"
    iops        = 3000
  }

  snapshot_options {
    automated_snapshot_start_hour = var.automated_snapshot_start_hour
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.es_log_group.arn
    log_type                 = "ES_APPLICATION_LOGS"
    enabled                  = true
  }

  encrypt_at_rest {
    enabled    = true
    kms_key_id = aws_kms_key.es_encryption_key.arn
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true
    
    master_user_options {
      master_user_name     = var.master_user_name
      master_user_password = var.master_user_password
    }
  }

  tags = var.tags
}

# CloudWatch Alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "cluster_status_red" {
  alarm_name          = "${local.domain_name}-cluster-status-red"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ClusterStatus.red"
  namespace           = "AWS/ES"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Elasticsearch cluster status is RED"
  alarm_actions       = [var.alarm_topic_arn]
  
  dimensions = {
    DomainName = local.domain_name
  }
}

# Output values for reference in other modules
output "domain_name" {
  value       = aws_elasticsearch_domain.main.domain_name
  description = "Name of the Elasticsearch domain"
}

output "domain_arn" {
  value       = aws_elasticsearch_domain.main.arn
  description = "ARN of the Elasticsearch domain"
}

output "domain_endpoint" {
  value       = aws_elasticsearch_domain.main.endpoint
  description = "Endpoint URL for the Elasticsearch domain"
}

output "kibana_endpoint" {
  value       = aws_elasticsearch_domain.main.kibana_endpoint
  description = "Endpoint URL for the Kibana interface"
}

output "kms_key_arn" {
  value       = aws_kms_key.es_encryption_key.arn
  description = "ARN of the KMS key used for encryption"
}