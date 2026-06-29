resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = var.environment == "production" ? 30 : 7

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/nexus/${var.environment}/app"
  retention_in_days = var.environment == "production" ? 30 : 7

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.cluster_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "CPU Utilization"
          region = var.aws_region
          metrics = [
            ["AWS/EKS", "CPUUtilization", "ClusterName", var.cluster_name]
          ]
          period = 300
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Memory Utilization"
          region = var.aws_region
          metrics = [
            ["AWS/EKS", "MemoryUtilization", "ClusterName", var.cluster_name]
          ]
          period = 300
          stat   = "Average"
        }
      }
    ]
  })
}
