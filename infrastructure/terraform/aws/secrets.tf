resource "aws_secretsmanager_secret" "jwt_signing_key" {
  name                    = "${var.cluster_name}/jwt-signing-key"
  description             = "JWT signing key for Nexus CRM"
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "jwt_signing_key" {
  secret_id     = aws_secretsmanager_secret.jwt_signing_key.id
  secret_string = "placeholder-replace-manually"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "api_keys" {
  name                    = "${var.cluster_name}/api-keys"
  description             = "Third-party API keys"
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "api_keys" {
  secret_id     = aws_secretsmanager_secret.api_keys.id
  secret_string = jsonencode({
    twilio_account_sid  = "placeholder"
    twilio_auth_token   = "placeholder"
    sendgrid_api_key    = "placeholder"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
