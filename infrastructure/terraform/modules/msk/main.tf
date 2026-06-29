resource "aws_security_group" "msk" {
  name_prefix = "nexus-msk-${var.environment}"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  tags = {
    Name        = "nexus-msk-sg-${var.environment}"
    Environment = var.environment
  }
}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

resource "aws_msk_cluster" "main" {
  cluster_name           = "nexus-kafka-${var.environment}"
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.number_of_broker_nodes

  broker_node_group_info {
    instance_type   = var.broker_instance_type
    client_subnets  = var.private_subnets
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk.arn
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  tags = {
    Name        = "nexus-msk-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_kms_key" "msk" {
  description = "NEXUS MSK encryption key"

  tags = {
    Name        = "nexus-msk-key-${var.environment}"
    Environment = var.environment
  }
}
