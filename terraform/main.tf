terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# VPC and Networking
module "vpc" {
  source = "./modules/vpc"
  
  vpc_name = var.vpc_name
  vpc_cidr = var.vpc_cidr
}

# ECR Repository
resource "aws_ecr_repository" "base_indexer" {
  name = var.ecr_repository_name
  force_delete = true
}

# SSM Parameters for Database Credentials
resource "aws_ssm_parameter" "postgres_db" {
  name  = "/base-indexer/POSTGRES_DB"
  type  = "SecureString"
  value = var.postgres_db
}

resource "aws_ssm_parameter" "postgres_user" {
  name  = "/base-indexer/POSTGRES_USER"
  type  = "SecureString"
  value = var.postgres_user
}

resource "aws_ssm_parameter" "postgres_password" {
  name  = "/base-indexer/POSTGRES_PASSWORD"
  type  = "SecureString"
  value = var.postgres_password
} 