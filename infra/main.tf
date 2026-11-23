# Terraform for the Galway trip app.
#
# Shape of the deployment (deliberately boring, no domain purchase):
#
#   CloudFront (*.cloudfront.net certificate)  ->  S3 bucket with the PWA files
#                                             ->  Lambda function URL (JSON) -> DynamoDB room
#
# CloudFront's own domain already has valid TLS, which is what makes the app
# installable as a PWA; the S3 *website* endpoint would force downloads instead
# of rendering HTML, and ACM certificates would require a domain to validate.
#
# State lives in ./terraform.tfstate next to this file.  It contains the room
# key, so it stays out of git; move it to an S3 backend when a second person
# starts deploying.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.region
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  bucket       = "${var.project}-${data.aws_caller_identity.current.account_id}-${var.region}"
  key_name     = "/${var.project}/room-key"
  api_name     = "${var.project}-room-api"
  table_name   = "${var.project}-room"
  app_origin   = "https://${aws_cloudfront_distribution.site.domain_name}"
  cors_origins = concat([local.app_origin], var.dev_origins)
  tags = {
    app     = var.project
    managed = "terraform"
  }
}
