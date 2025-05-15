# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "base-indexer-rds"
  description = "Security group for Base Indexer RDS instance"
  vpc_id      = module.vpc.vpc_id

  # Allow direct access from anywhere
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow direct PostgreSQL access from anywhere"
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

  parameter {
    name  = "statement_timeout"
    value = "60000"  # 1 minute in milliseconds
    apply_method = "immediate"
  }

  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "60000"  # 1 minute in milliseconds
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "tcp_keepalives_idle"
    value = "60"  # 60 seconds
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "tcp_keepalives_interval"
    value = "30"  # 30 seconds
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "tcp_keepalives_count"
    value = "3"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "max_connections"
    value = "LEAST({DBInstanceClassMemory/9531392},100)"  # More conservative max connections
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/32768}"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "work_mem"
    value = "4096"  # 4MB in kilobytes
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "GREATEST({DBInstanceClassMemory*1024/63963136},65536)"
    apply_method = "pending-reboot"
  }

  tags = {
    Name = "base-indexer"
  }
}

# RDS Subnet Group
resource "aws_db_subnet_group" "base_indexer" {
  name       = "base-indexer"
  subnet_ids = module.vpc.public_subnet_ids

  tags = {
    Name = "base-indexer"
  }
}

# RDS Instance
resource "aws_db_instance" "base_indexer" {
  identifier           = "base-indexer"
  engine              = "postgres"
  engine_version      = "16.4"
  instance_class      = "db.t3.medium"
  allocated_storage   = 100
  storage_type        = "gp3"
  
  db_name             = var.postgres_db
  username            = var.postgres_user
  password            = var.postgres_password
  
  db_subnet_group_name   = aws_db_subnet_group.base_indexer.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.base_indexer.name
  
  backup_retention_period = 7
  skip_final_snapshot    = true
  publicly_accessible    = true
  
  # Enable Enhanced Monitoring
  monitoring_interval = 60  # Collect metrics every 60 seconds
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  
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

# IAM role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "base-indexer-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
} 