provider "aws" {
  region     = var.aws_region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}

variable "aws_region" {
  type = string
}

variable "aws_access_key" {
  type = string
}

variable "aws_secret_key" {
  type = string
}

variable "username" {
  type = string
}

resource "aws_iam_user" "main" {
  name = var.username

  tags = {
    Name = "IndraSuite-IAM"
  }
}

resource "aws_iam_access_key" "main" {
  user = aws_iam_user.main.name
}

output "username" {
  value = aws_iam_user.main.name
}

output "user_arn" {
  value = aws_iam_user.main.arn
}

output "access_key_id" {
  value     = aws_iam_access_key.main.id
  sensitive = true
}

output "secret_access_key" {
  value     = aws_iam_access_key.main.secret
  sensitive = true
}
