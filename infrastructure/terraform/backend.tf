# Backend configuration for Terraform state management
# AWS Provider version: ~> 5.0

terraform {
  backend "s3" {
    # Primary state bucket configuration
    bucket = "projectx-terraform-state"
    key    = "terraform.tfstate"
    region = "us-west-2"
    
    # Enable encryption at rest using AES256
    encrypt = true
    
    # DynamoDB table for state locking
    dynamodb_table = "projectx-terraform-locks"
    
    # Workspace configuration for environment separation
    workspace_key_prefix = "environments"
    
    # Access logging configuration
    acl           = "private"
    force_destroy = false

    # Versioning configuration
    versioning {
      enabled = true
      mfa_delete = true
    }

    # Server-side encryption configuration
    server_side_encryption_configuration {
      rule {
        apply_server_side_encryption_by_default {
          sse_algorithm = "AES256"
        }
      }
    }

    # Cross-region replication configuration
    replication_configuration {
      role = "arn:aws:iam::ACCOUNT_ID:role/terraform-state-replication-role"
      rules {
        id       = "StateReplication"
        priority = 1
        status   = "Enabled"
        
        destination {
          bucket        = "arn:aws:s3:::projectx-terraform-state-replica"
          storage_class = "STANDARD"
        }
      }
    }

    # Lifecycle rules for cost optimization
    lifecycle_rule {
      enabled = true
      
      noncurrent_version_expiration {
        days = 90
      }
      
      abort_incomplete_multipart_upload {
        days_after_initiation = 7
      }
    }
  }

  # Required provider configuration
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Required Terraform version
  required_version = ">= 1.0.0"
}

# Configure AWS provider with region from variables
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Project     = "ProjectX"
    }
  }
}