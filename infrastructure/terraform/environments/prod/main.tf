terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "nexus-terraform-state-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "nexus-terraform-locks-prod"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "nexus"
    }
  }
}

module "vpc" {
  source             = "../../modules/vpc"
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

module "eks" {
  source              = "../../modules/eks"
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  private_subnets     = module.vpc.private_subnets
  node_desired_size   = 4
  node_min_size       = 3
  node_max_size       = 10
  node_instance_types = ["t3.large"]
}

module "rds" {
  source          = "../../modules/rds"
  environment     = var.environment
  vpc_id          = module.vpc.vpc_id
  private_subnets = module.vpc.private_subnets
  instance_class  = "db.r6g.2xlarge"
  cluster_size    = 3
}

module "elasticache" {
  source          = "../../modules/elasticache"
  environment     = var.environment
  vpc_id          = module.vpc.vpc_id
  private_subnets = module.vpc.private_subnets
  node_type       = "cache.m6g.large"
  num_cache_nodes = 3
}

module "msk" {
  source               = "../../modules/msk"
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnets      = module.vpc.private_subnets
  broker_instance_type = "kafka.m5.large"
}

module "s3" {
  source                = "../../modules/s3"
  environment           = var.environment
  backup_bucket_name    = "nexus-postgres-backups-prod"
  documents_bucket_name = "nexus-documents-prod"
}

module "iam" {
  source            = "../../modules/iam"
  environment       = var.environment
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_provider_url = module.eks.cluster_endpoint
}
