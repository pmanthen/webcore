output "vpc_id" {
  description = "ID of the application VPC"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB / ingress)"
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs (ECS Fargate tasks)"
  value       = module.networking.private_subnet_ids
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster hosting web and worker services"
  value       = module.ecs.cluster_name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = module.ecs.cluster_arn
}

output "web_service_name" {
  description = "Placeholder ECS service name for the Next.js web app"
  value       = module.ecs.web_service_name
}

output "worker_service_name" {
  description = "Placeholder ECS service name for the AI worker"
  value       = module.ecs.worker_service_name
}
