variable "environment" {
  description = "Environment name"
  type        = string
}

variable "backup_bucket_name" {
  description = "S3 bucket for PostgreSQL backups"
  type        = string
}

variable "documents_bucket_name" {
  description = "S3 bucket for documents"
  type        = string
}
