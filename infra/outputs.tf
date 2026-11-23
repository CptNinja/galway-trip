# Everything deploy/deploy.py reads back after an apply.

output "site_url" {
  description = "Install this URL on the phones."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}/"
}

output "distribution_id" {
  description = "Voor CDN-invalidaties na een publicatie."
  value       = aws_cloudfront_distribution.site.id
}

output "api_url" {
  description = "Eindpunt dat de sync-code in config.js schrijft."
  value       = aws_lambda_function_url.api.function_url
}

output "table_name" {
  description = "DynamoDB-tabel met de gedeelde kamers."
  value       = aws_dynamodb_table.room.name
}

output "bucket" {
  description = "Bucket met de app-bestanden."
  value       = aws_s3_bucket.assets.bucket
}

output "room_key_parameter" {
  description = "SSM-paramernaam met de gedeelde sleutel (nooit in git)."
  value       = aws_ssm_parameter.room_key.name
}

output "cors_origins" {
  description = "Origins die de sync-API mag antwoorden."
  value       = local.cors_origins
}
