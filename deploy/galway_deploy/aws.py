"""The few AWS calls Terraform cannot make: read the key, publish, invalidate.

Kept deliberately small; everything that can be declarative lives in infra/.
"""

from __future__ import annotations

import time
from typing import Any

import boto3
from botocore.exceptions import ClientError

from galway_deploy.settings import ConfigError

PROBES = ("cloudformation", "cloudfront", "s3", "dynamodb", "lambda", "ssm", "iam")


class Aws:
    """Boto3 clients for one region, plus the CDN invalidation dance."""

    def __init__(self, region: str, profile: str = "") -> None:
        self.region = region
        self.profile = profile
        self._session = boto3.Session(profile_name=profile or None, region_name=region)
        self._clients: dict[str, Any] = {}

    def client(self, name: str) -> Any:
        if name not in self._clients:
            self._clients[name] = self._session.client(name)
        return self._clients[name]

    # ---------------------------------------------------------------- identity

    def whoami(self) -> tuple[str, str]:
        identity = self.client("sts").get_caller_identity()
        return identity["Arn"].split("/")[-1], identity["Account"]

    def account_id(self) -> str:
        return self.whoami()[1]

    def permission_problems(self) -> list[str]:
        """Touch each service the deploy uses so mistakes surface before apply."""
        checks = {
            "cloudfront": lambda: self.client("cloudfront").list_distributions(),
            "s3": lambda: self.client("s3").list_buckets(),
            "dynamodb": lambda: self.client("dynamodb").list_tables(Limit=1),
            "lambda": lambda: self.client("lambda").list_functions(MaxItems=1),
            "ssm": lambda: self.client("ssm").get_parameters_by_path(Path="/galway-probe", Recursive=False),
        }
        problems = []
        for service, check in checks.items():
            try:
                check()
            except ClientError as error:
                problems.append(f"{service}: {error.response['Error'].get('Code', 'onbekend')}")
        return problems

    # -------------------------------------------------------------- room key

    def read_room_key(self, parameter_name: str) -> str:
        """The key Terraform generated; this script never creates or rotates it."""
        try:
            stored = self.client("ssm").get_parameter(Name=parameter_name, WithDecryption=True)
        except ClientError as error:
            raise ConfigError(
                f"Roomsleutel {parameter_name} niet gevonden ({error.response['Error']['Code']}). "
                "Draai eerst: python deploy/deploy.py up"
            ) from error
        return stored["Parameter"]["Value"]

    # ------------------------------------------------------------ distribution

    def distribution_arn(self, distribution_id: str) -> str:
        return f"arn:aws:cloudfront::{self.account_id()}:distribution/{distribution_id}"

    def invalidate_everything(self, distribution_id: str) -> str:
        cloudfront = self.client("cloudfront")
        response = cloudfront.create_invalidation(
            DistributionId=distribution_id,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": ["/*"]},
                "CallerReference": f"galway-{int(time.time())}",
            },
        )
        return response["Invalidation"]["Id"]

    def wait_for_invalidation(self, distribution_id: str, invalidation_id: str, attempts: int = 30) -> str:
        """Spread the news; a stale phone is the most common 'my change is missing'."""
        cloudfront = self.client("cloudfront")
        for _ in range(attempts):
            status = cloudfront.get_invalidation(DistributionId=distribution_id, Id=invalidation_id)
            if status["Invalidation"]["Status"] == "Completed":
                return "Completed"
            time.sleep(10)
        return "InProgress"
