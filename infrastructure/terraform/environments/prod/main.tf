# Production environment Terraform configuration for Project X rental platform
# AWS Provider version: ~> 5.0

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "projectx-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# Local variables for resource naming and configuration
locals {
  environment         = "prod"
  project_name       = "projectx"
  region             = "us-west-2"
  availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]
  
  tags = {
    Environment         = "prod"
    Project            = "projectx"
    ManagedBy          = "terraform"
    SecurityCompliance = "soc2"
    DataClassification = "sensitive"
  }
}

# AWS Provider configuration
provider "aws" {
  region = local.region
  default_tags = local.tags
}

# VPC Module - Enhanced network infrastructure with security controls
module "vpc" {
  source = "../../modules/vpc"
  
  project_name        = local.project_name
  environment         = local.environment
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = local.availability_zones
  
  enable_nat_gateway    = true
  enable_flow_logs      = true
  flow_log_retention_days = 90
  enable_vpc_endpoints  = true
}

# EKS Module - Production-grade Kubernetes cluster
module "eks" {
  source = "../../modules/eks"
  
  project_name       = local.project_name
  environment        = local.environment
  vpc_id            = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  
  cluster_version          = "1.27"
  node_instance_types     = ["r6g.2xlarge", "r6g.4xlarge"]
  node_min_size           = 5
  node_max_size           = 15
  node_desired_size       = 7
  
  enable_cluster_encryption     = true
  enable_container_insights     = true
  enable_control_plane_logging = true
}

# RDS Module - Highly available Aurora PostgreSQL cluster
module "rds" {
  source = "../../modules/rds"
  
  project_name       = local.project_name
  environment        = local.environment
  vpc_id            = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  
  instance_count    = 3
  instance_class    = "db.r6g.2xlarge"
  database_name     = "projectx"
  master_username   = "admin"
  engine_version    = "15.3"
  
  backup_retention_period = 30
  enable_performance_insights = true
  enable_enhanced_monitoring = true
  monitoring_interval       = 15
  
  enable_auto_minor_version_upgrade = true
  enable_deletion_protection        = true
}

# Outputs for infrastructure management
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "rds_cluster_endpoint" {
  description = "RDS cluster endpoint"
  value       = module.rds.cluster_endpoint
}