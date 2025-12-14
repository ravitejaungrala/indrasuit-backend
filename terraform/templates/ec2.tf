# ============================================================================
# EC2 Instance Terraform Template with Full Security
# IndraSuite Provisioning Platform
# ============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ============================================================================
# Provider Configuration
# ============================================================================

provider "aws" {
  region     = var.aws_region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
  token      = var.aws_session_token

  default_tags {
    tags = {
      ManagedBy    = "IndraSuite"
      Environment  = var.environment
      DeploymentId = var.deployment_id
      CreatedBy    = var.created_by
    }
  }
}

# ============================================================================
# Variables
# ============================================================================

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
}

variable "aws_access_key" {
  description = "AWS access key"
  type        = string
  sensitive   = true
}

variable "aws_secret_key" {
  description = "AWS secret key"
  type        = string
  sensitive   = true
}

variable "aws_session_token" {
  description = "AWS session token (for AssumeRole)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "deployment_id" {
  description = "Unique deployment identifier"
  type        = string
}

variable "created_by" {
  description = "User who created this deployment"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

# Instance Configuration
variable "instance_name" {
  description = "Name tag for the EC2 instance"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"

  validation {
    condition     = can(regex("^(t2|t3|t3a|m5|m5a|c5|c5a|r5|r5a)\\.(micro|small|medium|large|xlarge|2xlarge)$", var.instance_type))
    error_message = "Instance type must be a valid AWS instance type."
  }
}

variable "ami_id" {
  description = "AMI ID for the EC2 instance"
  type        = string

  validation {
    condition     = can(regex("^ami-[a-z0-9]{8,}$", var.ami_id))
    error_message = "AMI ID must be valid (ami-xxxxxxxx)."
  }
}

variable "key_name" {
  description = "SSH key pair name"
  type        = string
}

# Storage Configuration
variable "root_volume_size" {
  description = "Size of root EBS volume in GB"
  type        = number
  default     = 20

  validation {
    condition     = var.root_volume_size >= 8 && var.root_volume_size <= 1000
    error_message = "Root volume size must be between 8 and 1000 GB."
  }
}

variable "root_volume_type" {
  description = "Type of root EBS volume"
  type        = string
  default     = "gp3"

  validation {
    condition     = contains(["gp2", "gp3", "io1", "io2"], var.root_volume_type)
    error_message = "Volume type must be gp2, gp3, io1, or io2."
  }
}

variable "enable_ebs_encryption" {
  description = "Enable EBS encryption"
  type        = bool
  default     = true
}

variable "delete_on_termination" {
  description = "Delete EBS volume on instance termination"
  type        = bool
  default     = true
}

# Network Configuration
variable "vpc_id" {
  description = "VPC ID (optional, will use default VPC if not provided)"
  type        = string
  default     = ""
}

variable "subnet_id" {
  description = "Subnet ID (optional)"
  type        = string
  default     = ""
}

variable "associate_public_ip" {
  description = "Associate public IP address"
  type        = bool
  default     = true
}

# Security Group Configuration
variable "create_security_group" {
  description = "Create a new security group"
  type        = bool
  default     = true
}

variable "security_group_name" {
  description = "Name for the security group"
  type        = string
  default     = ""
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed for SSH access"
  type        = list(string)
  default     = []
}

variable "allowed_http_cidrs" {
  description = "CIDR blocks allowed for HTTP access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "allowed_https_cidrs" {
  description = "CIDR blocks allowed for HTTPS access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "custom_ingress_rules" {
  description = "Custom ingress rules"
  type = list(object({
    from_port   = number
    to_port     = number
    protocol    = string
    cidr_blocks = list(string)
    description = string
  }))
  default = []
}

# User Data
variable "user_data" {
  description = "User data script to run on instance launch"
  type        = string
  default     = ""
}

variable "user_data_base64" {
  description = "Base64 encoded user data"
  type        = string
  default     = ""
}

# Monitoring
variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring"
  type        = bool
  default     = false
}

# IAM
variable "create_iam_instance_profile" {
  description = "Create IAM instance profile"
  type        = bool
  default     = false
}

variable "iam_role_policies" {
  description = "List of IAM policy ARNs to attach to instance role"
  type        = list(string)
  default     = []
}

# Tags
variable "additional_tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}

# ============================================================================
# Data Sources
# ============================================================================

# Get default VPC if not provided
data "aws_vpc" "default" {
  count   = var.vpc_id == "" ? 1 : 0
  default = true
}

# Get default subnet if not provided
data "aws_subnets" "default" {
  count = var.subnet_id == "" ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [local.vpc_id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# ============================================================================
# Local Variables
# ============================================================================

locals {
  vpc_id    = var.vpc_id != "" ? var.vpc_id : data.aws_vpc.default[0].id
  subnet_id = var.subnet_id != "" ? var.subnet_id : data.aws_subnets.default[0].ids[0]

  security_group_name = var.security_group_name != "" ? var.security_group_name : "${var.instance_name}-sg"

  common_tags = merge(
    {
      Name        = var.instance_name
      Terraform   = "true"
      ManagedBy   = "IndraSuite"
      Environment = var.environment
    },
    var.additional_tags
  )
}

# ============================================================================
# Security Group
# ============================================================================

resource "aws_security_group" "ec2" {
  count = var.create_security_group ? 1 : 0

  name        = local.security_group_name
  description = "Security group for ${var.instance_name}"
  vpc_id      = local.vpc_id

  tags = merge(
    local.common_tags,
    {
      Name = local.security_group_name
    }
  )
}

# SSH Access (Port 22)
resource "aws_security_group_rule" "ssh" {
  count = var.create_security_group && length(var.allowed_ssh_cidrs) > 0 ? 1 : 0

  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = var.allowed_ssh_cidrs
  description       = "SSH access"
  security_group_id = aws_security_group.ec2[0].id
}

# HTTP Access (Port 80)
resource "aws_security_group_rule" "http" {
  count = var.create_security_group && length(var.allowed_http_cidrs) > 0 ? 1 : 0

  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = var.allowed_http_cidrs
  description       = "HTTP access"
  security_group_id = aws_security_group.ec2[0].id
}

# HTTPS Access (Port 443)
resource "aws_security_group_rule" "https" {
  count = var.create_security_group && length(var.allowed_https_cidrs) > 0 ? 1 : 0

  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = var.allowed_https_cidrs
  description       = "HTTPS access"
  security_group_id = aws_security_group.ec2[0].id
}

# Custom Ingress Rules
resource "aws_security_group_rule" "custom_ingress" {
  count = var.create_security_group ? length(var.custom_ingress_rules) : 0

  type              = "ingress"
  from_port         = var.custom_ingress_rules[count.index].from_port
  to_port           = var.custom_ingress_rules[count.index].to_port
  protocol          = var.custom_ingress_rules[count.index].protocol
  cidr_blocks       = var.custom_ingress_rules[count.index].cidr_blocks
  description       = var.custom_ingress_rules[count.index].description
  security_group_id = aws_security_group.ec2[0].id
}

# Egress Rule (Allow all outbound traffic)
resource "aws_security_group_rule" "egress" {
  count = var.create_security_group ? 1 : 0

  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "Allow all outbound traffic"
  security_group_id = aws_security_group.ec2[0].id
}

# ============================================================================
# IAM Role and Instance Profile
# ============================================================================

resource "aws_iam_role" "ec2" {
  count = var.create_iam_instance_profile ? 1 : 0

  name = "${var.instance_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ec2" {
  count = var.create_iam_instance_profile ? length(var.iam_role_policies) : 0

  role       = aws_iam_role.ec2[0].name
  policy_arn = var.iam_role_policies[count.index]
}

resource "aws_iam_instance_profile" "ec2" {
  count = var.create_iam_instance_profile ? 1 : 0

  name = "${var.instance_name}-profile"
  role = aws_iam_role.ec2[0].name

  tags = local.common_tags
}

# ============================================================================
# EC2 Instance
# ============================================================================

resource "aws_instance" "main" {
  ami           = var.ami_id
  instance_type = var.instance_type
  key_name      = var.key_name

  # Network Configuration
  subnet_id                   = local.subnet_id
  vpc_security_group_ids      = var.create_security_group ? [aws_security_group.ec2[0].id] : []
  associate_public_ip_address = var.associate_public_ip

  # Storage Configuration
  root_block_device {
    volume_size           = var.root_volume_size
    volume_type           = var.root_volume_type
    encrypted             = var.enable_ebs_encryption
    delete_on_termination = var.delete_on_termination
  }

  # IAM Instance Profile
  iam_instance_profile = var.create_iam_instance_profile ? aws_iam_instance_profile.ec2[0].name : null

  # User Data
  user_data        = var.user_data != "" ? var.user_data : null
  user_data_base64 = var.user_data_base64 != "" ? var.user_data_base64 : null

  # Monitoring
  monitoring = var.enable_detailed_monitoring

  # Metadata Options (IMDSv2)
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # Enforce IMDSv2
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  # Enable termination protection for production
  disable_api_termination = var.environment == "production" ? true : false

  # Tags
  tags = merge(
    local.common_tags,
    {
      Name = var.instance_name
    }
  )

  volume_tags = merge(
    local.common_tags,
    {
      Name = "${var.instance_name}-root-volume"
    }
  )

  # Lifecycle
  lifecycle {
    ignore_changes = [
      ami, # Prevent replacement on AMI updates
      user_data,
      user_data_base64
    ]
  }
}

# ============================================================================
# CloudWatch Alarms (Optional)
# ============================================================================

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count = var.enable_detailed_monitoring ? 1 : 0

  alarm_name          = "${var.instance_name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors EC2 CPU utilization"

  dimensions = {
    InstanceId = aws_instance.main.id
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "status_check_failed" {
  count = var.enable_detailed_monitoring ? 1 : 0

  alarm_name          = "${var.instance_name}-status-check-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = "60"
  statistic           = "Maximum"
  threshold           = "0"
  alarm_description   = "This metric monitors EC2 status checks"

  dimensions = {
    InstanceId = aws_instance.main.id
  }

  tags = local.common_tags
}

# ============================================================================
# Outputs
# ============================================================================

output "instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.main.id
}

output "instance_arn" {
  description = "ARN of the EC2 instance"
  value       = aws_instance.main.arn
}

output "public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_instance.main.public_ip
}

output "private_ip" {
  description = "Private IP address of the EC2 instance"
  value       = aws_instance.main.private_ip
}

output "public_dns" {
  description = "Public DNS name of the EC2 instance"
  value       = aws_instance.main.public_dns
}

output "private_dns" {
  description = "Private DNS name of the EC2 instance"
  value       = aws_instance.main.private_dns
}

output "security_group_id" {
  description = "ID of the security group"
  value       = var.create_security_group ? aws_security_group.ec2[0].id : null
}

output "security_group_name" {
  description = "Name of the security group"
  value       = var.create_security_group ? aws_security_group.ec2[0].name : null
}

output "iam_role_arn" {
  description = "ARN of the IAM role"
  value       = var.create_iam_instance_profile ? aws_iam_role.ec2[0].arn : null
}

output "iam_instance_profile_arn" {
  description = "ARN of the IAM instance profile"
  value       = var.create_iam_instance_profile ? aws_iam_instance_profile.ec2[0].arn : null
}

output "availability_zone" {
  description = "Availability zone of the instance"
  value       = aws_instance.main.availability_zone
}

output "subnet_id" {
  description = "Subnet ID where instance is deployed"
  value       = aws_instance.main.subnet_id
}

output "vpc_id" {
  description = "VPC ID where instance is deployed"
  value       = local.vpc_id
}
