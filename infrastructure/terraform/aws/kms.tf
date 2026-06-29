resource "aws_kms_key" "main" {
  description             = "Nexus CRM main encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "${var.cluster_name}-main"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.cluster_name}-main"
  target_key_id = aws_kms_key.main.key_id
}

resource "aws_kms_key" "postgres" {
  description             = "Nexus CRM PostgreSQL encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "${var.cluster_name}-postgres"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "postgres" {
  name          = "alias/${var.cluster_name}-postgres"
  target_key_id = aws_kms_key.postgres.key_id
}
