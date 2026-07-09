variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnets" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "nexus"
}

variable "db_name" {
  description = "Default database name"
  type        = string
  default     = "nexus"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "cluster_size" {
  description = "Number of Aurora instances (1 writer + readers)"
  type        = number
  default     = 3
}
