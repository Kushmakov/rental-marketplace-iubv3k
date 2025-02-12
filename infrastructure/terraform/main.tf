# Root Terraform configuration for rental marketplace platform infrastructure
# AWS Provider version: ~> 5.0
# Kubernetes Provider version: ~> 2.23
# Helm Provider version: ~> 2.11

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes" 
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    encrypt        = true
    bucket         = var.state_bucket
    key            = var.state_key
    region         = var.aws_region
    dynamodb_table = var.lock_table
  }
}

# AWS Provider configuration with enhanced security settings
provider "aws" {
  region = var.aws_region
  
  default_tags = {
    Environment   = var.environment
    Project      = "rental-marketplace"
    ManagedBy    = "terraform"
    SecurityLevel = "high"
  }

  assume_role {
    role_arn = var.aws_role_arn
  }
}

# Kubernetes provider configuration for EKS cluster management
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

# VPC module for secure network infrastructure
module "vpc" {
  source = "./modules/vpc"

  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  environment        = var.environment
  enable_flow_logs   = true
  enable_vpc_endpoints = true
  enable_nat_gateway = true
  single_nat_gateway = false

  tags = {
    Owner       = var.owner_tag
    CostCenter  = var.cost_center_tag
    Application = "rental-marketplace"
  }
}

# EKS module for container orchestration platform
module "eks" {
  source = "./modules/eks"

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  cluster_version    = var.eks_cluster_version
  node_instance_types = var.eks_node_instance_types
  desired_capacity   = var.eks_desired_capacity
  environment        = var.environment
  enable_encryption  = true
  enable_logging     = true
  enable_monitoring  = true

  cluster_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  endpoint_private_access = true
  endpoint_public_access  = false

  node_groups = {
    main = {
      min_size     = 2
      max_size     = 10
      desired_size = var.eks_desired_capacity
      instance_types = var.eks_node_instance_types
    }
  }
}

# Outputs for infrastructure components
output "vpc_id" {
  description = "ID of the created VPC with enhanced security features"
  value       = module.vpc.vpc_id
}

output "eks_cluster_name" {
  description = "Name of the EKS cluster with monitoring enabled"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "Secure endpoint URL of the EKS cluster"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}