resource "aws_security_group" "rds" {
  name_prefix = "nexus-rds-${var.environment}"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "nexus-rds-sg-${var.environment}"
    Environment = var.environment
  }
}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

resource "aws_rds_cluster_parameter_group" "main" {
  name        = "nexus-aurora-pg-${var.environment}"
  family      = "aurora-postgresql16"
  description = "NEXUS Aurora PostgreSQL parameter group"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier              = "nexus-aurora-${var.environment}"
  engine                          = "aurora-postgresql"
  engine_version                  = "16.1"
  database_name                   = var.db_name
  master_username                 = var.db_username
  master_password                 = random_password.master.result
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.rds.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name
  backup_retention_period         = 7
  preferred_backup_window         = "03:00-04:00"
  storage_encrypted               = true
  skip_final_snapshot             = var.environment != "prod"

  tags = {
    Name        = "nexus-aurora-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_instance" "main" {
  count              = var.cluster_size
  identifier         = "nexus-aurora-${var.environment}-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = var.instance_class
  engine             = aws_rds_cluster.main.engine

  tags = {
    Name        = "nexus-aurora-${var.environment}-${count.index + 1}"
    Environment = var.environment
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "nexus-rds-subnets-${var.environment}"
  subnet_ids = var.private_subnets

  tags = {
    Name        = "nexus-rds-subnets-${var.environment}"
    Environment = var.environment
  }
}

resource "random_password" "master" {
  length  = 32
  special = false
}
