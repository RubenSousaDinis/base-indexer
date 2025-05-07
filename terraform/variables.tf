variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "eu-west-1"
}

variable "vpc_name" {
  description = "Name of the VPC"
  type        = string
  default     = "base-indexer-vpc"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "ecr_repository_name" {
  description = "Name of the ECR repository"
  type        = string
  default     = "base-indexer"
}

variable "cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
  default     = "base-indexer"
}

variable "service_name" {
  description = "Name of the ECS service"
  type        = string
  default     = "base-indexer"
}

variable "task_family" {
  description = "Family name for the ECS task definition"
  type        = string
  default     = "base-indexer"
}

variable "task_cpu" {
  description = "CPU units for the ECS task"
  type        = string
  default     = "1024"
}

variable "task_memory" {
  description = "Memory for the ECS task in MiB"
  type        = string
  default     = "2048"
}

variable "container_name" {
  description = "Name of the container"
  type        = string
  default     = "base-indexer"
}

variable "base_rpc_url" {
  description = "Base RPC URL"
  type        = string
}

variable "start_block" {
  description = "Starting block number for indexing"
  type        = string
  default     = "0"
}

variable "batch_size" {
  description = "Number of blocks to process in each batch"
  type        = string
  default     = "100"
}

variable "num_workers" {
  description = "Number of worker threads"
  type        = string
  default     = "2"
}

variable "service_desired_count" {
  description = "Desired number of tasks for the ECS service"
  type        = number
  default     = 1
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "base_indexer"
}

variable "postgres_user" {
  description = "PostgreSQL username"
  type        = string
  default     = "base_indexer"
}

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
} 