# Bastion host for database access
resource "aws_instance" "bastion" {
  ami           = "ami-04e7764922e1e3a57"  # Latest Amazon Linux 2023 AMI for eu-west-1
  instance_type = "t3.micro"
  subnet_id     = module.vpc.private_subnet_ids[0]

  iam_instance_profile = aws_iam_instance_profile.bastion.name

  vpc_security_group_ids = [aws_security_group.bastion.id]

  tags = {
    Name = "base-indexer-bastion"
  }
}

# IAM role for bastion host
resource "aws_iam_role" "bastion" {
  name = "base-indexer-bastion"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# IAM instance profile for bastion
resource "aws_iam_instance_profile" "bastion" {
  name = "base-indexer-bastion"
  role = aws_iam_role.bastion.name
}

# IAM policy for bastion to use SSM
resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Security group for bastion
resource "aws_security_group" "bastion" {
  name        = "base-indexer-bastion"
  description = "Security group for Base Indexer bastion host"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "base-indexer-bastion"
  }
} 