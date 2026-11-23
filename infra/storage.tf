# Static app files: a private bucket that only this CloudFront distribution may read.

resource "aws_s3_bucket" "assets" {
  bucket = local.bucket
  tags   = merge(local.tags, { role = "app-assets" })

  # Files are re-published by deploy/deploy.py; losing the bucket costs nothing
  # but a re-publish, while destroying it during a typo'd apply would be rude.
  lifecycle {
    prevent_destroy = false
  }
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Origin Access Control instead of a public bucket or legacy OAI identity.
resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = "${var.project}-bucket"
  description                       = "CloudFront reading the Galway app bucket"
  origin_access_control_origin_type = "s3"
  signing_protocol                  = "sigv4"
  signing_behavior                  = "always"
}

data "aws_iam_policy_document" "cdn_read" {
  statement {
    sid     = "CloudFrontOnly"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    resources = ["${aws_s3_bucket.assets.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"

      values = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "cdn_read" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.cdn_read.json
}
