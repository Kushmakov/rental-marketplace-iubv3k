# Terraform configuration for creating a secure and scalable VPC infrastructure
# AWS Provider version: ~> 5.0

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
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })
}

# Data source for current AWS region
data "aws_region" "current" {}

# Main VPC resource with IPv6 support
resource "aws_vpc" "main" {
  cidr_block                       = var.vpc_cidr
  enable_dns_hostnames            = true
  enable_dns_support              = true
  assign_generated_ipv6_cidr_block = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

# Public subnets across availability zones
resource "aws_subnet" "public" {
  count                           = length(var.availability_zones)
  vpc_id                         = aws_vpc.main.id
  cidr_block                     = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone             = var.availability_zones[count.index]
  map_public_ip_on_launch       = true
  assign_ipv6_address_on_creation = true
  ipv6_cidr_block               = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, count.index)

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-${var.availability_zones[count.index]}"
    Tier = "Public"
  })
}

# Private subnets across availability zones
resource "aws_subnet" "private" {
  count                           = length(var.availability_zones)
  vpc_id                         = aws_vpc.main.id
  cidr_block                     = cidrsubnet(var.vpc_cidr, 4, count.index + length(var.availability_zones))
  availability_zone             = var.availability_zones[count.index]
  map_public_ip_on_launch       = false
  assign_ipv6_address_on_creation = true
  ipv6_cidr_block               = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, count.index + length(var.availability_zones))

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-${var.availability_zones[count.index]}"
    Tier = "Private"
  })
}

# Internet Gateway for public subnet internet access
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

# NAT Gateways for private subnet internet access
resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? length(var.availability_zones) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-${var.availability_zones[count.index]}"
  })

  depends_on = [aws_internet_gateway.main]
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? length(var.availability_zones) : 0
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-eip-${var.availability_zones[count.index]}"
  })
}

# Route table for public subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  route {
    ipv6_cidr_block = "::/0"
    gateway_id      = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rt-public"
    Tier = "Public"
  })
}

# Route tables for private subnets
resource "aws_route_table" "private" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.main[count.index].id
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rt-private-${var.availability_zones[count.index]}"
    Tier = "Private"
  })
}

# Route table associations for public subnets
resource "aws_route_table_association" "public" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Route table associations for private subnets
resource "aws_route_table_association" "private" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Flow Logs configuration
resource "aws_cloudwatch_log_group" "flow_log" {
  count             = var.enable_flow_logs ? 1 : 0
  name              = "/aws/vpc/${local.name_prefix}-flow-logs"
  retention_in_days = 30

  tags = local.common_tags
}

resource "aws_flow_log" "main" {
  count                = var.enable_flow_logs ? 1 : 0
  log_destination_type = "cloud-watch-logs"
  log_destination     = aws_cloudwatch_log_group.flow_log[0].arn
  traffic_type        = "ALL"
  vpc_id              = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-flow-log"
  })
}

# S3 VPC Endpoint for private subnet access
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-s3-endpoint"
  })
}

# Network ACLs for additional security
resource "aws_network_acl" "main" {
  vpc_id     = aws_vpc.main.id
  subnet_ids = concat(aws_subnet.public[*].id, aws_subnet.private[*].id)

  ingress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  egress {
    protocol   = "-1"
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nacl"
  })
}