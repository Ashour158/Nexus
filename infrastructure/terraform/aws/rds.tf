resource "aws_db_subnet_group" "main" {
  name       = "${var.cluster_name}-db-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "${var.cluster_name}-db-subnet-group"
  }
}

resource "aws_security_group" "postgres" {
  name_prefix = "${var.cluster_name}-postgres-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.cluster_name}-postgres"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "primary" {
  identifier = "${var.cluster_name}-primary"

  engine         = "postgres"
  engine_version = "16.2"
  instance_class = var.environment == "production" ? "db.r6g.xlarge" : "db.t3.medium"

  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.postgres.arn

  db_name  = "nexus"
  username = "nexus_admin"
  password = random_password.postgres.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  publicly_accessible    = false

  multi_az               = var.environment == "production"
  backup_retention_period = 30
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  skip_final_snapshot = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.cluster_name}-final" : null

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name        = "${var.cluster_name}-primary"
    Environment = var.environment
  }
}

resource "aws_db_instance" "replica" {
  count = var.environment == "production" ? 1 : 0

  identifier     = "${var.cluster_name}-replica"
  instance_class = aws_db_instance.primary.instance_class

  replicate_source_db = aws_db_instance.primary.arn

  vpc_security_group_ids = [aws_security_group.postgres.id]
  publicly_accessible    = false

  storage_encrypted = true

  skip_final_snapshot = true

  tags = {
    Name        = "${var.cluster_name}-replica"
    Environment = var.environment
    Role        = "read-replica"
  }
}

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "postgres" {
  name = "${var.cluster_name}/postgres"
}

resource "aws_secretsmanager_secret_version" "postgres" {
  secret_id = aws_secretsmanager_secret.postgres.id
  secret_string = jsonencode({
    username = aws_db_instance.primary.username
    password = random_password.postgres.result
    host     = aws_db_instance.primary.address
    port     = aws_db_instance.primary.port
    db_name  = aws_db_instance.primary.db_name
  })
}

resource "aws_secretsmanager_secret" "postgres_replica" {
  count = var.environment == "production" ? 1 : 0
  name  = "${var.cluster_name}/postgres-replica"
}

resource "aws_secretsmanager_secret_version" "postgres_replica" {
  count     = var.environment == "production" ? 1 : 0
  secret_id = aws_secretsmanager_secret.postgres_replica[0].id
  secret_string = jsonencode({
    username = aws_db_instance.primary.username
    password = random_password.postgres.result
    host     = aws_db_instance.replica[0].address
    port     = aws_db_instance.replica[0].port
    db_name  = aws_db_instance.primary.db_name
  })
}
