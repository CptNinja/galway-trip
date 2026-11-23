"""The deploy commands, in the order the platform needs them.

    up       terraform apply  ->  read key  ->  publish files  ->  invalidate CDN
    assets                                     publish files  ->  invalidate CDN
    status   read terraform outputs and list the bucket
    destroy  empty the bucket (optional)  ->  terraform destroy

Everything is idempotent: ``up`` is both first install and re-deploy, and
``assets`` is what you run after changing only HTML, CSS or JavaScript.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from galway_deploy.assets import Bucket, planned_uploads, stale_keys, summarize
from galway_deploy.aws import Aws
from galway_deploy.settings import ConfigError, Site
from galway_deploy.terraform import Outputs, Terraform


@dataclass
class Report:
    """What a command produced, formatted in the order a person reads it."""

    site_url: str = ""
    api_url: str = ""
    table: str = ""
    bucket: str = ""
    published: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def lines(self) -> list[str]:
        rows = [("App", self.site_url), ("Sync API", self.api_url), ("DynamoDB", self.table), ("Bucket", self.bucket)]
        return [f"  {label:<11}{value}" for label, value in rows if value]


class Deployer:
    """Terraform for infrastructure, boto3 for files."""

    def __init__(self, site: Site, aws: Aws) -> None:
        self.site = site
        self.aws = aws
        self.bucket = Bucket(aws.client("s3"))

    def terraform(self) -> Terraform:
        return Terraform(self.site.terraform_dir, self.site.terraform_vars(), self.aws.profile)

    # --------------------------------------------------------------- commands

    def up(self, *, prune: bool = False, plan_only: bool = False) -> Report:
        terraform = self.terraform()
        if plan_only:
            print(terraform.plan())
            return Report(notes=["Alleen het plan getoond; er is niets veranderd."])
        outputs = terraform.apply()
        if not outputs.applied:
            raise ConfigError("Terraform draaide door maar gaf geen outputs; bekijk 'terraform output' in infra/.")
        report = self._publish(outputs, prune=prune)
        report.notes.insert(0, "Stack staat: infra/terraform.tfstate")
        return report

    def infra(self) -> Report:
        """Only the terraform part: useful before the app files are ready."""
        outputs = self.terraform().apply()
        if not outputs.applied:
            raise ConfigError("Terraform draaide door zonder outputs; bekijk 'terraform output' in infra/.")
        return Report(
            site_url=outputs.site_url,
            api_url=outputs.api_url,
            table=outputs.table_name,
            bucket=outputs.bucket,
            notes=["Infra staat; publiceer de bestanden met 'python deploy/deploy.py assets'."],
        )

    def publish(self, *, prune: bool = False) -> Report:
        outputs = self.terraform().outputs()
        if not outputs.applied:
            raise ConfigError("Nog niets uitgezet; draai eerst 'python deploy/deploy.py up'.")
        return self._publish(outputs, prune=prune)

    def status(self) -> Report:
        outputs = self.terraform().outputs()
        notes = []
        objects: list[str] = []
        if outputs.bucket and self.bucket.exists(outputs.bucket):
            objects = self.bucket.keys(outputs.bucket)
            notes.append(summarize([]) if not objects else f"{len(objects)} objecten in de bucket")
        else:
            notes.append("Bucket ontbreekt: draai 'up'.")
        if not outputs.applied:
            notes.append("Nog geen infra: python deploy/deploy.py up")
        return Report(
            site_url=outputs.site_url,
            api_url=outputs.api_url,
            table=outputs.table_name,
            bucket=outputs.bucket,
            published=objects,
            notes=notes,
        )

    def destroy(self, *, purge: bool = False) -> Report:
        outputs = self.terraform().outputs()
        notes = [
            "De DynamoDB-tabel met de trip-data is beschermd en blijft achter; "
            "'terraform state rm aws_dynamodb_table.room' in infra/ en dan destroy als je hem echt kwijt wilt."
        ]
        removed: list[str] = []
        if purge and outputs.bucket:
            count = self.bucket.empty(outputs.bucket)
            removed.append(f"{count} objecten uit {outputs.bucket}")
        self.terraform().destroy()
        notes.append("CloudFront verwijderen duurt enkele minuten.")
        return Report(bucket=outputs.bucket, removed=removed, notes=notes)

    def doctor(self) -> Report:
        name, account = self.aws.whoami()
        problems = self.aws.permission_problems()
        outputs = self.terraform().outputs()
        notes = [f"Ingelogd als {name} in account {account}, regio {self.aws.region}"]
        if problems:
            notes += [f"Rechten ontbreken: {problem}" for problem in problems]
        else:
            notes.append("CloudFront, S3, DynamoDB, Lambda en SSM bereikbaar")
        notes.append(f"Room: '{self.site.room}' → sleutel {self.site.room_key_parameter}")
        if outputs.applied:
            notes.append(f"Al live: {outputs.site_url}")
        else:
            notes.append("Nog niets uitgerold; 'up' doet alles.")
        return Report(site_url=outputs.site_url, api_url=outputs.api_url, table=outputs.table_name, bucket=outputs.bucket, notes=notes)

    # ------------------------------------------------------------------ inner

    def _publish(self, outputs: Outputs, *, prune: bool) -> Report:
        key = self.aws.read_room_key(outputs.room_key_parameter)
        config_js = self.site.production_config(outputs.api_url, key)
        uploads = planned_uploads(self.site, config_js)
        self.bucket.require(outputs.bucket)
        published = self.bucket.publish(outputs.bucket, uploads)
        removed = []
        if prune:
            removed = self.bucket.prune(outputs.bucket, stale_keys(self.bucket.keys(outputs.bucket), [upload.key for upload in uploads]))
        print(f"  Publiceren: {summarize(uploads)}")
        invalidation = self.aws.invalidate_everything(outputs.distribution_id)
        state = self.aws.wait_for_invalidation(outputs.distribution_id, invalidation)
        notes = [f"CDN-invalidatie {invalidation}: {state}"]
        notes.append("De app haalt de nieuwe versie binnen zodra de service worker ververst is.")
        return Report(
            site_url=outputs.site_url,
            api_url=outputs.api_url,
            table=outputs.table_name,
            bucket=outputs.bucket,
            published=published,
            removed=removed,
            notes=notes,
        )
