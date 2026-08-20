# Terraform — AWS foundation (Phase 2)

Scaffolds networking and ECS/Fargate placeholders for the Autonomous UX Evaluation platform.

## Layout

```
infra/
├── versions.tf          # Terraform + provider version constraints
├── providers.tf         # AWS provider + default tags
├── variables.tf
├── main.tf              # wiring for modules
├── outputs.tf
├── terraform.tfvars.example
└── modules/
    ├── networking/      # VPC, public/private subnets, IGW, optional NAT
    └── ecs/             # ECS cluster, IAM, SGs, placeholder web/worker services
```

## Prerequisites

- Terraform `>= 1.5`
- AWS credentials with permissions to manage VPC, ECS, IAM, CloudWatch Logs
- Optional: remote state backend (S3 + DynamoDB) — commented in `versions.tf`

## Usage

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
# terraform apply   # only when intentional; NAT + Fargate incur cost
```

Defaults keep `enable_nat_gateway = false` and service `desired_count = 0` so a dry scaffold apply stays cheap.

## What is real vs placeholder

| Resource | Status |
|----------|--------|
| VPC, subnets, IGW, route tables | Implemented |
| NAT gateways | Optional (`enable_nat_gateway`) |
| ECS cluster + Fargate capacity providers | Implemented |
| Execution / task IAM roles | Implemented |
| CloudWatch log groups | Implemented |
| Web / worker task definitions | **Placeholder** busybox images — replace with ECR builds of `apps/web` and `apps/worker` |
| ALB, RDS, ElastiCache, Secrets Manager | Not yet — follow-on work |

## Next infrastructure steps

1. ECR repositories + CI image push for web and worker
2. RDS Postgres + ElastiCache Redis in private subnets
3. Application Load Balancer in public subnets → web service
4. Secrets Manager / SSM for `DATABASE_URL`, `REDIS_URL`, API keys
5. Enable NAT (or VPC endpoints) so private Fargate tasks can pull images and reach AWS APIs
