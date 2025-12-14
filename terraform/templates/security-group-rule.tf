terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region     = var.aws_region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_access_key" {
  description = "AWS access key"
  type        = string
}

variable "aws_secret_key" {
  description = "AWS secret key"
  type        = string
}

variable "security_group_id" {
  description = "Security Group ID to add rule to"
  type        = string
}

variable "port" {
  description = "Port to open"
  type        = number
}

variable "description" {
  description = "Description for the security group rule"
  type        = string
  default     = "Auto-opened by RaDynamics"
}

# Add ingress rule to existing security group
resource "aws_security_group_rule" "app_port" {
  type              = "ingress"
  from_port         = var.port
  to_port           = var.port
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = var.description
  security_group_id = var.security_group_id
}

output "security_group_rule_id" {
  value = aws_security_group_rule.app_port.id
}

output "port_opened" {
  value = var.port
}

output "security_group_id" {
  value = var.security_group_id
}