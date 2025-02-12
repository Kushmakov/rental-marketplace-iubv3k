# Terraform configuration for staging environment infrastructure
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
    key            = "staging/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

# Local variables for resource naming and tagging
locals {
  environment = "staging"
  project_name = "projectx"
  region = "us-west-2"
  availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]
  
  common_tags = {
    Environment = "staging"
    Project = "projectx"
    ManagedBy = "terraform"
    CostCenter = "staging-ops"
    DataClassification = "confidential"
  }
}

# AWS Provider configuration
provider "aws" {
  region = local.region
  default_tags = local.common_tags
  
  assume_role {
    role_arn = "arn:aws:iam::ACCOUNT_ID:role/TerraformDeployment"
  }
}

# VPC Module - Network Infrastructure
module "vpc" {
  source = "../../modules/vpc"
  version = "1.0.0"

  project_name = local.project_name
  environment = local.environment
  vpc_cidr = "10.1.0.0/16"
  availability_zones = local.availability_zones
  
  enable_nat_gateway = true
  enable_vpn_gateway = false
  enable_flow_logs = true
  flow_logs_retention_days = 30
}

# EKS Module - Kubernetes Cluster
module "eks" {
  source = "../../modules/eks"
  version = "1.0.0"

  project_name = local.project_name
  environment = local.environment
  vpc_id = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  
  cluster_version = "1.27"
  node_instance_types = ["t3.large"]
  node_desired_size = 3
  node_min_size = 2
  node_max_size = 5
  
  enable_cluster_autoscaler = true
  enable_metrics_server = true
  enable_container_insights = true
  
  cluster_encryption_config = {
    provider_key_arn = "arn:aws:kms:REGION:ACCOUNT_ID:key/KMS_KEY_ID"
    resources = ["secrets"]
  }
}

# RDS Module - Database Cluster
module "rds" {
  source = "../../modules/rds"
  version = "1.0.0"

  project_name = local.project_name
  environment = local.environment
  vpc_id = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  
  database_name = "projectx"
  instance_count = 2
  instance_class = "db.r6g.large"
  
  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"
  preferred_maintenance_window = "mon:04:00-mon:05:00"
  
  enable_performance_insights = true
  performance_insights_retention_period = 7
  enable_enhanced_monitoring = true
  monitoring_interval = 60
  
  deletion_protection = true
  storage_encrypted = true
}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value = module.vpc.public_subnet_ids
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value = module.eks.cluster_endpoint
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value = module.eks.cluster_name
}

output "eks_cluster_security_group_id" {
  description = "EKS cluster security group ID"
  value = module.eks.cluster_security_group_id
}

output "rds_cluster_endpoint" {
  description = "RDS cluster endpoint"
  value = module.rds.cluster_endpoint
}

output "rds_cluster_reader_endpoint" {
  description = "RDS cluster reader endpoint"
  value = module.rds.cluster_reader_endpoint
}

output "rds_cluster_resource_id" {
  description = "RDS cluster resource ID"
  value = module.rds.cluster_resource_id
}