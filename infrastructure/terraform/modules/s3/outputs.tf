# Output values for the S3 module exposing secure bucket configurations
# while maintaining security best practices and compliance requirements

output "bucket_id" {
  value       = aws_s3_bucket.documents.id
  description = "The unique identifier of the S3 bucket used for document storage and resource referencing"
}

output "bucket_arn" {
  value       = aws_s3_bucket.documents.arn
  description = "The ARN of the S3 bucket for use in IAM policies, security configurations, and audit trails"
}

output "bucket_domain_name" {
  value       = aws_s3_bucket.documents.bucket_domain_name
  description = "The domain name of the S3 bucket for constructing secure URLs to access stored documents"
}

output "versioning_status" {
  value       = aws_s3_bucket_versioning.documents.status
  description = "The current versioning status of the S3 bucket (Enabled/Suspended) for compliance verification and audit purposes"
}