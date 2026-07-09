output "service_role_arn" {
  description = "Service IAM role ARN"
  value       = aws_iam_role.service_role.arn
}

output "irsa_role_arn" {
  description = "IRSA IAM role ARN"
  value       = aws_iam_role.irsa.arn
}
