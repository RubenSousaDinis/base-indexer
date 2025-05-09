# ECS Cluster
resource "aws_ecs_cluster" "base_indexer" {
  name = "base-indexer"
}

# ECS Task Definition
resource "aws_ecs_task_definition" "base_indexer" {
  family                   = "base-indexer"
  network_mode            = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                     = "1024"
  memory                  = "2048"
  execution_role_arn      = aws_iam_role.ecs_execution_role.arn
  task_role_arn           = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "base-indexer"
      image     = "${aws_ecr_repository.base_indexer.repository_url}:latest"
      essential = true
      command   = ["node", "dist/index.js"]

      environment = [
        {
          name  = "BASE_RPC_URL"
          value = var.base_rpc_url
        },
        {
          name  = "START_BLOCK"
          value = tostring(var.start_block)
        },
        {
          name  = "BATCH_SIZE"
          value = tostring(var.batch_size)
        },
        {
          name  = "NUM_WORKERS"
          value = tostring(var.num_workers)
        }
      ]

      secrets = [
        {
          name      = "POSTGRES_HOST"
          valueFrom = "/base-indexer/POSTGRES_HOST"
        },
        {
          name      = "POSTGRES_PORT"
          valueFrom = "/base-indexer/POSTGRES_PORT"
        },
        {
          name      = "POSTGRES_DB"
          valueFrom = "/base-indexer/POSTGRES_DB"
        },
        {
          name      = "POSTGRES_USER"
          valueFrom = "/base-indexer/POSTGRES_USER"
        },
        {
          name      = "POSTGRES_PASSWORD"
          valueFrom = "/base-indexer/POSTGRES_PASSWORD"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/base-indexer"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

# ECS Service
resource "aws_ecs_service" "base_indexer" {
  name            = "base-indexer"
  cluster         = aws_ecs_cluster.base_indexer.id
  task_definition = aws_ecs_task_definition.base_indexer.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.public_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "base_indexer" {
  name              = "/ecs/base-indexer"
  retention_in_days = 30
} 