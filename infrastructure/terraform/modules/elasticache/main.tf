# AWS Provider configuration
# Provider version: ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  name_prefix = "${var.environment}-redis"
  common_tags = {
    Environment = var.environment
    Terraform   = "true"
    Service     = "elasticache"
    ManagedBy   = "terraform"
  }
}

# Redis subnet group for cluster deployment
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${local.name_prefix}-subnet-group"
  subnet_ids  = var.private_subnet_ids
  description = "Subnet group for Redis cluster in ${var.environment}"
  tags        = local.common_tags
}

# Redis parameter group with optimized settings
resource "aws_elasticache_parameter_group" "redis" {
  family      = "redis7.0"
  name        = "${local.name_prefix}-params"
  description = "Redis parameter group for rental platform"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  tags = local.common_tags
}

# Security group for Redis access control
resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-sg"
  vpc_id      = var.vpc_id
  description = "Security group for Redis cluster in ${var.environment}"

  ingress {
    description = "Redis port access"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# Redis replication group with high availability configuration
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = local.name_prefix
  description         = "Redis cluster for rental platform in ${var.environment}"
  node_type           = "cache.t4g.medium"
  port                = 6379

  parameter_group_name = aws_elasticache_parameter_group.redis.name
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]

  # High availability settings
  automatic_failover_enabled = true
  multi_az_enabled          = true
  num_cache_clusters        = 2

  # Engine configuration
  engine         = "redis"
  engine_version = "7.0"

  # Security settings
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token_enabled         = true

  # Maintenance settings
  maintenance_window      = "sun:05:00-sun:06:00"
  snapshot_window        = "04:00-05:00"
  snapshot_retention_limit = 7
  auto_minor_version_upgrade = true
  apply_immediately      = false

  tags = local.common_tags
}