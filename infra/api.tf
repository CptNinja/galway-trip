# Shared room: one DynamoDB item per group, written through a Lambda function URL.

resource "aws_dynamodb_table" "room" {
  name         = local.table_name
  hash_key     = "room"
  billing_mode = "PAY_PER_REQUEST"

  attribute {
    name = "room"
    type = "S"
  }

  tags = merge(local.tags, { role = "room-store" })

  # Terraform needs prevent_destroy to be a literal: while the trip data is in
  # the table, terraform destroy refuses to run. When the trip is really over,
  # run 'terraform state rm aws_dynamodb_table.room' and destroy the rest.
  lifecycle {
    prevent_destroy = true
  }
}

# The shared room key: generated once, stored as a SecureString, never rotated.
resource "random_password" "room_key" {
  length  = 32
  special = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ssm_parameter" "room_key" {
  name        = local.key_name
  description = "Shared key for the Galway trip sync API"
  type        = "SecureString"
  value       = random_password.room_key.result
  tags        = local.tags

  lifecycle {
    ignore_changes  = [value]
    prevent_destroy = true
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${var.project}-room-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = merge(local.tags, { role = "sync-api" })
}

data "aws_iam_policy_document" "api" {
  statement {
    sid       = "WriteRooms"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.room.arn]
  }

  statement {
    sid       = "ReadRoomKey"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:${data.aws_partition.current.partition}:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.key_name}"]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "room-store"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# Terraform's log permission keeps the function from failing silently on cold start.
resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../api"
  output_path = "${path.module}/.build/room_api.zip"

  # Byte-for-byte reproducible, so an unchanged handler never redeploys the function.
  excludes = ["__pycache__", "*.pyc"]
}

resource "aws_lambda_function" "api" {
  function_name    = local.api_name
  description      = "Document store met optimistische versiebeheer voor gedeelde trip-status"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  handler          = "room_api.handler"
  runtime          = var.lambda_runtime
  memory_size      = 128
  timeout          = 20
  role             = aws_iam_role.api.arn
  tags             = merge(local.tags, { role = "sync-api" })

  environment {
    variables = {
      ROOM_TABLE      = aws_dynamodb_table.room.name
      ROOM_KEY_PARAM  = aws_ssm_parameter.room_key.name
      ALLOWED_ORIGINS = join(",", local.cors_origins)
    }
  }

  depends_on = [aws_iam_role_policy_attachment.api_logs]
}

# A function URL instead of API Gateway: one service less, no per-request price,
# and the app only ever needs GET and PUT with a shared key header.
#
# No `cors` block on purpose. AWS' managed function-URL CORS answers the
# preflight itself and pastes its own access-control-allow-origin next to the
# one the handler already sets; two values in that header make every browser
# refuse the response ("Sync mislukt"), while curl never notices. The handler
# answers OPTIONS before it checks the room key, so it is the only CORS source.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}

# AuthType NONE still needs the function policy, and AWS checks two actions:
# InvokeFunctionUrl (only that one may carry the NONE condition) and a plain
# InvokeFunction. The room key header is what actually keeps strangers out.
resource "aws_lambda_permission" "invoke_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "invoke_function" {
  statement_id  = "AllowPublicFunctionInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "*"
}
