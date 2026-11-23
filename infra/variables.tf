variable "region" {
  type        = string
  description = "AWS-regio voor alle bronnen, bijvoorbeeld eu-central-1."
}

variable "project" {
  type        = string
  default     = "galway-trip"
  description = "Voorvoegsel voor bucket, tabel, Lambda en SSM-sleutel."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{2,40}$", var.project))
    error_message = "project moet klein zijn, beginnen met een letter/cijfer en alleen letters, cijfers en koppeltekens bevatten."
  }
}

variable "price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront-prijsklasse: 100 = EU/VS, 200 = + meer regio's, All = wereldwijd."

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class moet PriceClass_100, PriceClass_200 of PriceClass_All zijn."
  }
}

variable "dev_origins" {
  type        = list(string)
  default     = ["http://127.0.0.1:8765", "http://localhost:8765"]
  description = "Origins die naast de live-site CORS-toegang krijgen (lokaal ontwikkelen)."
}

variable "lambda_runtime" {
  type        = string
  default     = "python3.12"
  description = "Python-runtime van de sync-API; verhoog samen met wat AWS in deze regio biedt."
}

