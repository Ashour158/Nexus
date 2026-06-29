output "vpc_id" {
  value = module.vpc.vpc_id
}

output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "rds_writer_endpoint" {
  value = module.rds.cluster_endpoint
}

output "rds_reader_endpoint" {
  value = module.rds.reader_endpoint
}

output "redis_endpoint" {
  value = module.elasticache.primary_endpoint
}

output "msk_brokers" {
  value = module.msk.bootstrap_brokers
}
