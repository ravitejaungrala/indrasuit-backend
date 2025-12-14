provider "aws" {
  region     = var.aws_region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}

# Variables
variable "aws_region" {
  type = string
}

variable "aws_access_key" {
  type = string
}

variable "aws_secret_key" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "bucket_type" {
  type    = string
  default = "general-purpose"
}

variable "versioning_enabled" {
  type    = bool
  default = false
}

variable "mfa_delete" {
  type    = bool
  default = false
}

variable "encryption_enabled" {
  type    = bool
  default = true
}

variable "encryption_type" {
  type    = string
  default = "SSE-S3"
}

variable "kms_key_id" {
  type    = string
  default = ""
}

variable "bucket_key_enabled" {
  type    = bool
  default = true
}

variable "is_public" {
  type    = bool
  default = false
}

variable "block_public_acls" {
  type    = bool
  default = true
}

variable "block_public_policy" {
  type    = bool
  default = true
}

variable "ignore_public_acls" {
  type    = bool
  default = true
}

variable "restrict_public_buckets" {
  type    = bool
  default = true
}

variable "transfer_acceleration" {
  type    = bool
  default = false
}

variable "requester_pays" {
  type    = bool
  default = false
}

variable "static_website_hosting" {
  type    = bool
  default = false
}

variable "index_document" {
  type    = string
  default = "index.html"
}

variable "error_document" {
  type    = string
  default = "error.html"
}

variable "intelligent_tiering" {
  type    = bool
  default = false
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Table Bucket Variables
variable "table_format" {
  type    = string
  default = "iceberg"
}

variable "enable_table_metadata" {
  type    = bool
  default = true
}

variable "enable_schema_evolution" {
  type    = bool
  default = false
}

# Vector Bucket Variables
variable "vector_dimension" {
  type    = string
  default = "768"
}

variable "custom_vector_dimension" {
  type    = string
  default = ""
}

variable "distance_metric" {
  type    = string
  default = "cosine"
}

variable "enable_vector_index" {
  type    = bool
  default = true
}

variable "enable_similarity_search" {
  type    = bool
  default = true
}

# S3 Bucket
resource "aws_s3_bucket" "main" {
  bucket = var.bucket_name
  tags   = local.final_tags
}

# Versioning
resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id

  versioning_configuration {
    status     = var.versioning_enabled ? "Enabled" : "Disabled"
    mfa_delete = var.mfa_delete ? "Enabled" : "Disabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  count  = var.encryption_enabled ? 1 : 0
  bucket = aws_s3_bucket.main.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.encryption_type == "SSE-KMS" ? "aws:kms" : "AES256"
      kms_master_key_id = var.encryption_type == "SSE-KMS" && var.kms_key_id != "" ? var.kms_key_id : null
    }
    bucket_key_enabled = var.encryption_type == "SSE-KMS" ? var.bucket_key_enabled : null
  }
}

# Public access block
resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id

  block_public_acls       = var.is_public ? false : var.block_public_acls
  block_public_policy     = var.is_public ? false : var.block_public_policy
  ignore_public_acls      = var.is_public ? false : var.ignore_public_acls
  restrict_public_buckets = var.is_public ? false : var.restrict_public_buckets
}

# Transfer acceleration
resource "aws_s3_bucket_accelerate_configuration" "main" {
  count  = var.transfer_acceleration ? 1 : 0
  bucket = aws_s3_bucket.main.id
  status = "Enabled"
}

# Requester pays
resource "aws_s3_bucket_request_payment_configuration" "main" {
  count  = var.requester_pays ? 1 : 0
  bucket = aws_s3_bucket.main.id
  payer  = "Requester"
}

# Static website hosting
resource "aws_s3_bucket_website_configuration" "main" {
  count  = var.static_website_hosting ? 1 : 0
  bucket = aws_s3_bucket.main.id

  index_document {
    suffix = var.index_document
  }

  error_document {
    key = var.error_document
  }
}

# Intelligent Tiering
resource "aws_s3_bucket_intelligent_tiering_configuration" "main" {
  count  = var.intelligent_tiering ? 1 : 0
  bucket = aws_s3_bucket.main.id
  name   = "EntireBucket"

  status = "Enabled"

  filter {
    prefix = ""
  }

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 125
  }
}

# Public bucket policy (if public)
resource "aws_s3_bucket_policy" "public_read" {
  count  = var.is_public ? 1 : 0
  bucket = aws_s3_bucket.main.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.main.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.main]
}

# Table Bucket Configuration
# Note: Table buckets are configured through tags and lifecycle policies
resource "aws_s3_bucket_lifecycle_configuration" "table_bucket" {
  count  = var.bucket_type == "table" ? 1 : 0
  bucket = aws_s3_bucket.main.id

  rule {
    id     = "table_data_management"
    status = "Enabled"

    # Optimize for table data patterns
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

# Vector Bucket Configuration
# Note: Vector buckets are optimized for AI/ML workloads
resource "aws_s3_bucket_lifecycle_configuration" "vector_bucket" {
  count  = var.bucket_type == "vector" ? 1 : 0
  bucket = aws_s3_bucket.main.id

  rule {
    id     = "vector_data_management"
    status = "Enabled"

    # Optimize for vector data access patterns
    transition {
      days          = 60
      storage_class = "STANDARD_IA"
    }
  }
}

# CORS configuration for Vector buckets (AI/ML API access)
resource "aws_s3_bucket_cors_configuration" "vector_cors" {
  count  = var.bucket_type == "vector" ? 1 : 0
  bucket = aws_s3_bucket.main.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "POST", "PUT", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Enhanced tagging for all bucket types
locals {
  # Base tags for all buckets
  base_tags = merge(var.tags, {
    Name        = var.bucket_name
    Environment = "RaDynamics"
    ManagedBy   = "Terraform"
    BucketType  = var.bucket_type
  })

  # Additional tags for table buckets
  table_tags = var.bucket_type == "table" ? {
    TableFormat          = var.table_format
    TableMetadataEnabled = tostring(var.enable_table_metadata)
    SchemaEvolution      = tostring(var.enable_schema_evolution)
  } : {}

  # Additional tags for vector buckets
  vector_tags = var.bucket_type == "vector" ? {
    VectorDimension      = var.custom_vector_dimension != "" ? var.custom_vector_dimension : var.vector_dimension
    DistanceMetric       = var.distance_metric
    VectorIndexEnabled   = tostring(var.enable_vector_index)
    SimilaritySearch     = tostring(var.enable_similarity_search)
  } : {}

  # Final merged tags
  final_tags = merge(local.base_tags, local.table_tags, local.vector_tags)
}

# Outputs
output "bucket_name" {
  value = aws_s3_bucket.main.id
}

output "bucket_arn" {
  value = aws_s3_bucket.main.arn
}

output "bucket_domain_name" {
  value = aws_s3_bucket.main.bucket_domain_name
}

output "bucket_regional_domain_name" {
  value = aws_s3_bucket.main.bucket_regional_domain_name
}

output "website_endpoint" {
  value = var.static_website_hosting ? aws_s3_bucket_website_configuration.main[0].website_endpoint : null
}

output "website_domain" {
  value = var.static_website_hosting ? aws_s3_bucket_website_configuration.main[0].website_domain : null
}

output "bucket_type" {
  value = var.bucket_type
}

output "table_configuration" {
  value = var.bucket_type == "table" ? {
    format           = var.table_format
    metadata_enabled = var.enable_table_metadata
    schema_evolution = var.enable_schema_evolution
  } : null
}

output "vector_configuration" {
  value = var.bucket_type == "vector" ? {
    dimension         = var.custom_vector_dimension != "" ? var.custom_vector_dimension : var.vector_dimension
    distance_metric   = var.distance_metric
    index_enabled     = var.enable_vector_index
    similarity_search = var.enable_similarity_search
  } : null
}
