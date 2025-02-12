# Output values for EKS module exposing essential cluster information, endpoints,
# and security configurations for use by other modules and root configuration

output "cluster_id" {
  value       = aws_eks_cluster.main.id
  description = "The ID of the EKS cluster"
}

output "cluster_endpoint" {
  value       = aws_eks_cluster.main.endpoint
  description = "The endpoint URL for the EKS cluster API server"
}

output "cluster_certificate_authority_data" {
  value       = aws_eks_cluster.main.certificate_authority[0].data
  description = "The base64 encoded certificate data for the EKS cluster's certificate authority"
}

output "node_group_id" {
  value       = aws_eks_node_group.main.id
  description = "The ID of the EKS node group"
}

output "cluster_security_group_id" {
  value       = aws_security_group.cluster.id
  description = "The ID of the security group associated with the EKS cluster"
}