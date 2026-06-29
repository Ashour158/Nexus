resource "aws_security_group" "redis" {
  name_prefix = "nexus-redis-${var.environment}"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  tags = {
    Name        = "nexus-redis-sg-${var.environment}"
    Environment = var.environment
  }
}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "nexus-redis-${var.environment}"
  subnet_ids = var.private_subnets
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "nexus-redis-${var.environment}"
  description          = "NEXUS Redis cluster"
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_nodes
  port                 = 6379
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  automatic_failover_enabled = true

  tags = {
    Name        = "nexus-redis-${var.environment}"
    Environment = var.environment
  }
}
