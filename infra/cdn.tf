# CloudFront serving the PWA over its own HTTPS domain.

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Galway trip PWA"
  default_root_object = "index.html"
  http_version        = "http2and3"
  price_class         = var.price_class
  aliases             = []
  tags                = merge(local.tags, { role = "cdn" })

  # The AWS-provided certificate for *.cloudfront.net: no domain, no ACM
  # validation, still valid TLS, which is what makes the app installable.
  # A custom domain later only means adding an alias plus an ACM certificate.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id                = "app-bucket"
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }

  default_cache_behavior {
    target_origin_id       = "app-bucket"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    # The object's own Cache-Control wins inside Managed-CachingOptimized, and
    # deploy/deploy.py sets it per file: app files always revalidate, icons
    # cache for a week and are CDN-invalidated on every publish.
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
      locations        = []
    }
  }

  # Without this, apply returns while the domain still serves errors.
  wait_for_deployment = true

}
