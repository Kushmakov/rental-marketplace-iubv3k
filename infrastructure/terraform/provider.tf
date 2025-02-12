# Provider Configuration for Project X Rental Platform
# Terraform version constraint
terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    # AWS Provider v5.0 - Enhanced cloud provider with security and compliance features
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    
    # Kubernetes Provider v2.23 - For EKS cluster management
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    
    # Helm Provider v2.11 - For application deployments
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
}

# AWS Provider Configuration
provider "aws" {
  region = var.aws_region
  
  # Enhanced retry configuration for improved resilience
  retry_mode = "adaptive"
  
  # Default tags applied to all resources
  default_tags {
    tags = {
      Environment     = var.environment
      ManagedBy      = "Terraform"
      Project        = "ProjectX"
      SecurityLevel  = "High"
      ComplianceReq  = "SOC2,GDPR,PCI"
    }
  }

  # Cross-account role assumption for production environments
  dynamic "assume_role" {
    for_each = var.environment == "prod" ? [1] : []
    content {
      role_arn     = "arn:aws:iam::PRODUCTION_ACCOUNT_ID:role/TerraformExecutionRole"
      session_name = "TerraformProductionDeployment"
      external_id  = "ProjectXTerraformProd"
    }
  }
}

# Kubernetes Provider Configuration
provider "kubernetes" {
  # Host configuration retrieved from EKS cluster
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  
  # IRSA (IAM Roles for Service Accounts) configuration
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = [
      "eks",
      "get-token",
      "--cluster-name",
      data.aws_eks_cluster.cluster.name,
      "--region",
      var.aws_region
    ]
  }
}

# Helm Provider Configuration
provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.cluster.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args = [
        "eks",
        "get-token",
        "--cluster-name",
        data.aws_eks_cluster.cluster.name,
        "--region",
        var.aws_region
      ]
    }
  }

  # Helm repository configuration
  registry {
    url = "https://charts.helm.sh/stable"
    
    # Authentication for private registries if needed
    username = "chart-repo-user"
    password = data.aws_secretsmanager_secret_version.helm_repo_credentials.secret_string
  }

  # Optimize Helm operations with local caching
  repository_config_path = "${path.module}/.helm/repositories.yaml"
  repository_cache      = "${path.module}/.helm/cache"
}

# Data sources for provider configuration
data "aws_eks_cluster" "cluster" {
  name = "projectx-${var.environment}-cluster"
}

data "aws_secretsmanager_secret_version" "helm_repo_credentials" {
  secret_id = "projectx/${var.environment}/helm-repo-credentials"
}