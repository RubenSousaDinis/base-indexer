output "rds_endpoint" {
  description = "The connection endpoint for the RDS instance"
  value       = aws_db_instance.base_indexer.address
}

output "rds_port" {
  description = "The port the RDS instance is listening on"
  value       = aws_db_instance.base_indexer.port
}

output "rds_database_name" {
  description = "The name of the RDS database"
  value       = aws_db_instance.base_indexer.db_name
}

output "rds_username" {
  description = "The master username for the RDS instance"
  value       = aws_db_instance.base_indexer.username
  sensitive   = true
} 