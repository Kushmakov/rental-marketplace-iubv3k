# Input variables for S3 module configuring secure document storage
# with comprehensive security, compliance and scalability features

variable "environment" {
  type        = string
  description = "Strictly controlled environment name for secure bucket isolation (dev, staging, prod)"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod for security compliance"
  }
}

variable "project_name" {
  type        = string
  description = "Project identifier used for bucket naming and resource organization"
}

variable "versioning_enabled" {
  type        = bool
  description = "Enables document versioning for audit trails and compliance requirements"
  default     = true
}

variable "lifecycle_rules_enabled" {
  type        = bool
  description = "Controls document lifecycle management for retention and cost optimization"
  default     = true
}

variable "cors_enabled" {
  type        = bool
  description = "Enables secure cross-origin resource sharing for web and mobile applications"
  default     = true
}

variable "allowed_origins" {
  type        = list(string)
  description = "List of authorized origins for secure cross-origin access control"
  default     = ["*"]
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for organization, cost allocation, and compliance tracking"
  default     = {}
}