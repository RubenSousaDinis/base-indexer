#!/bin/bash

# Exit on error
set -e

# Load environment variables
source ../.env

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "Error: Could not get AWS account ID. Make sure you have configured AWS credentials."
    exit 1
fi

# Initialize Terraform
terraform init

# Create terraform.tfvars file
cat > terraform.tfvars << EOL
aws_region = "${AWS_REGION:-eu-west-1}"
base_rpc_url = "${BASE_RPC_URL}"
base_infura_rpc = "${BASE_INFURA_RPC}"
postgres_db = "${POSTGRES_DB:-base_indexer}"
postgres_user = "${POSTGRES_USER:-base_indexer}"
postgres_password = "${POSTGRES_PASSWORD}"
EOL

# Apply Terraform configuration to create ECR repository first
echo "Creating ECR repository with Terraform..."
terraform apply -auto-approve -target=aws_ecr_repository.base_indexer

# Build and push Docker image
echo "Building and pushing Docker image..."
aws ecr get-login-password --region ${AWS_REGION:-eu-west-1} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION:-eu-west-1}.amazonaws.com
docker buildx build --platform linux/amd64 -t base-indexer ../.
docker tag base-indexer:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION:-eu-west-1}.amazonaws.com/base-indexer:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION:-eu-west-1}.amazonaws.com/base-indexer:latest

# Force new deployment of ECS service
echo "Forcing new deployment of ECS service..."
aws ecs update-service --cluster base-indexer --service base-indexer --force-new-deployment

# Apply remaining Terraform configuration
echo "Applying remaining Terraform configuration..."
terraform apply -auto-approve

# Get the RDS endpoint
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
echo "RDS Endpoint: ${RDS_ENDPOINT}"

echo "Deployment completed successfully!" 