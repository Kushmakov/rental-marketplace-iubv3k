# Main Terraform configuration file for development environment
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
    key            = "dev/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "projectx-terraform-locks"
  }
}

# Configure AWS Provider
provider "aws" {
  region = "us-west-2"
  
  default_tags {
    tags = local.common_tags
  }
}

# Local variables
locals {
  project_name = "projectx"
  environment = "dev"
  common_tags = {
    Environment     = "dev"
    Project         = "projectx"
    ManagedBy      = "terraform"
    SecurityLevel   = "high"
    ComplianceScope = "soc2"
  }
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"
  
  project_name        = local.project_name
  environment         = local.environment
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]
  enable_nat_gateway = true
  enable_vpc_flow_logs = true
  enable_vpc_endpoints = true
  
  tags = local.common_tags
}

# EKS Module
module "eks" {
  source = "../../modules/eks"
  
  project_name        = local.project_name
  environment         = local.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  
  cluster_version          = "1.27"
  node_instance_types     = ["t3.large"]
  node_desired_size       = 2
  node_min_size          = 1
  node_max_size          = 4
  enable_secrets_encryption = true
  enable_private_endpoints = true
  enable_container_insights = true
  
  tags = local.common_tags

  depends_on = [module.vpc]
}

# RDS Module
module "rds" {
  source = "../../modules/rds"
  
  project_name        = local.project_name
  environment         = local.environment
  vpc_id             = module.vpc.vpc_id
  vpc_cidr           = module.vpc.vpc_cidr
  private_subnet_ids = module.vpc.private_subnet_ids
  
  database_name             = "projectx"
  master_username          = "admin"
  master_password          = "REPLACE_WITH_SECURE_PASSWORD" # Should be provided via secure parameter store
  instance_count           = 2
  instance_class           = "db.r6g.large"
  
  backup_retention_period   = 7
  preferred_backup_window   = "03:00-04:00"
  preferred_maintenance_window = "mon:04:00-mon:05:00"
  
  monitoring_interval      = 60
  performance_insights_enabled = true
  deletion_protection      = true
  skip_final_snapshot     = false
  apply_immediately       = false
  
  tags = local.common_tags

  depends_on = [module.vpc]
}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "rds_cluster_endpoint" {
  description = "RDS cluster endpoint"
  value       = module.rds.cluster_endpoint
  sensitive   = true
}

output "rds_reader_endpoint" {
  description = "RDS reader endpoint"
  value       = module.rds.reader_endpoint
  sensitive   = true
}