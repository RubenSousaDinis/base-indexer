# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "base-indexer-rds"
  description = "Security group for Base Indexer RDS instance"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  # Allow connections from private subnets
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.2.0/24", "10.0.3.0/24"]
  }

  # Allow connections from ECS tasks
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Allow from anywhere since RDS is publicly accessible
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "base-indexer-rds"
  }
}

# RDS Parameter Group
resource "aws_db_parameter_group" "base_indexer" {
  name   = "base-indexer"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "0"
    apply_method = "immediate"
  }

  parameter {
    name  = "password_encryption"
    value = "md5"
    apply_method = "immediate"
  }

  tags = {
    Name = "base-indexer"
  }
}

# RDS Subnet Group
resource "aws_db_subnet_group" "base_indexer" {
  name       = "base-indexer"
  subnet_ids = module.vpc.private_subnet_ids

  tags = {
    Name = "base-indexer"
  }
}

# RDS Instance
resource "aws_db_instance" "base_indexer" {
  identifier           = "base-indexer"
  engine              = "postgres"
  engine_version      = "16.3"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  storage_type        = "gp2"
  
  db_name             = var.postgres_db
  username            = var.postgres_user
  password            = var.postgres_password
  
  db_subnet_group_name   = aws_db_subnet_group.base_indexer.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.base_indexer.name
  
  backup_retention_period = 7
  skip_final_snapshot    = true
  publicly_accessible    = true
  
  # Enable all incoming connections
  iam_database_authentication_enabled = false
  
  # Disable SSL
  ca_cert_identifier = "rds-ca-rsa2048-g1"
  
  tags = {
    Name = "base-indexer"
  }
}

# Update SSM parameters to use RDS endpoint
resource "aws_ssm_parameter" "postgres_host" {
  name  = "/base-indexer/POSTGRES_HOST"
  type  = "SecureString"
  value = aws_db_instance.base_indexer.address
}

resource "aws_ssm_parameter" "postgres_port" {
  name  = "/base-indexer/POSTGRES_PORT"
  type  = "SecureString"
  value = tostring(aws_db_instance.base_indexer.port)
} 