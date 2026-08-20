variable "aws_region" {
  description = "AWS region for all foundation resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project name used for resource naming"
  type        = string
  default     = "ux-eval"
}

variable "environment" {
  description = "Deployment environment (e.g. staging, production)"
  type        = string
  default     = "staging"
}

variable "vpc_cidr" {
  description = "CIDR block for the application VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "availability_zones" {
  description = "AZs used for public/private subnet pairs"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "enable_nat_gateway" {
  description = "Whether to provision NAT gateways for private subnet egress (costly; off by default in scaffold)"
  type        = bool
  default     = false
}

variable "web_desired_count" {
  description = "Desired Fargate tasks for the Next.js web service (placeholder; keep 0 until ECR images exist)"
  type        = number
  default     = 0
}

variable "worker_desired_count" {
  description = "Desired Fargate tasks for the BullMQ worker service (placeholder; keep 0 until ECR images exist)"
  type        = number
  default     = 0
}
