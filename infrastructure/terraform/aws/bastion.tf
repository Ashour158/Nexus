resource "aws_security_group" "bastion" {
  count = var.environment != "production" ? 1 : 0

  name_prefix = "${var.cluster_name}-bastion-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.cluster_name}-bastion"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_instance" "bastion" {
  count = var.environment != "production" ? 1 : 0

  ami                    = data.aws_ami.amazon_linux_2.id
  instance_type          = "t3.micro"
  subnet_id              = module.vpc.public_subnets[0]
  vpc_security_group_ids = [aws_security_group.bastion[0].id]
  key_name               = aws_key_pair.bastion[0].key_name

  tags = {
    Name        = "${var.cluster_name}-bastion"
    Environment = var.environment
  }
}

resource "aws_key_pair" "bastion" {
  count = var.environment != "production" ? 1 : 0

  key_name   = "${var.cluster_name}-bastion"
  public_key = file("~/.ssh/id_rsa.pub")
}

data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}
