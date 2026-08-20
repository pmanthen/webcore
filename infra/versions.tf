terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment and configure for remote state in shared environments.
  # backend "s3" {
  #   bucket         = "ux-eval-terraform-state"
  #   key            = "phase2/foundation/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "ux-eval-terraform-locks"
  #   encrypt        = true
  # }
}
