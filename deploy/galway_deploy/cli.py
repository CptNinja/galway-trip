"""Command line for putting the Galway trip app on AWS.

    python deploy/deploy.py doctor              check account, region and permissions
    python deploy/deploy.py plan                show the terraform plan, change nothing
    python deploy/deploy.py up                  infra + app files (first install and re-deploy)
    python deploy/deploy.py assets              only publish files and invalidate the CDN
    python deploy/deploy.py status              what is live right now
    python deploy/deploy.py url                 print the app URL
    python deploy/deploy.py key                 print the shared room key
    python deploy/deploy.py destroy --yes       remove the infrastructure (--purge empties the bucket)

From the repository root, using the virtualenv that has boto3:
    python3 -m venv .venv && .venv/bin/pip install -r deploy/requirements.txt
"""

from __future__ import annotations

import argparse
import subprocess
import sys

from botocore.exceptions import ClientError, NoRegionError, ProfileNotFound

from galway_deploy.aws import Aws
from galway_deploy.pipeline import Deployer, Report
from galway_deploy.settings import PRICE_CLASSES, ConfigError
from galway_deploy.terraform import TerraformError

REGION_FALLBACK = "eu-central-1"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="deploy.py",
        description="Zet de Galway-trip-app op AWS: CloudFront + S3 + DynamoDB, zonder eigen domein.",
        epilog="Terraform doet de infrastructuur; dit script publiceert de bestanden.",
    )
    parser.add_argument("--region", default="", help=f"AWS-regio (anders AWS_REGION, 'aws configure get region', dan {REGION_FALLBACK})")
    parser.add_argument("--profile", default="", help="AWS-cli-profiel als de standaard niet klopt")
    parser.add_argument("--project", default="galway-trip", help="Voorvoegsel voor bucket, tabel en Lambda")
    parser.add_argument("--room", default="galway", help="Naam van de gedeelde sync-ruimte")
    parser.add_argument("--price-class", dest="price_class", default="PriceClass_100", choices=PRICE_CLASSES)

    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Controleer rechten en regio zonder iets aan te raken")
    commands.add_parser("plan", help="Terraform-plan tonen")
    commands.add_parser("infra", help="Alleen de infrastructuur uitzetten (terraform apply)")
    commands.add_parser("status", help="Wat staat er nu?")
    commands.add_parser("url", help="Toon de app-URL")
    commands.add_parser("key", help="Toon de gedeelde roomsleutel")
    for name in ("up", "assets"):
        command = commands.add_parser(name, help="App publiceren" + (" incl. infrastructuur" if name == "up" else ""))
        command.add_argument("--prune", action="store_true", help="Bestanden die er niet meer toe horen verwijderen")
    destroy = commands.add_parser("destroy", help="Infrastructuur verwijderen")
    destroy.add_argument("--purge", action="store_true", help="Leeg ook de bucket (onomkeerbaar)")
    destroy.add_argument("--yes", action="store_true", help="Bevestig dat je het echt weet")
    return parser


def resolve_region(explicit: str) -> str:
    """Same order the AWS CLI uses, with a last-resort region we know works."""
    import os

    if explicit:
        return explicit
    for variable in ("AWS_REGION", "AWS_DEFAULT_REGION"):
        if os.environ.get(variable):
            return os.environ[variable]
    try:
        result = subprocess.run(["aws", "configure", "get", "region"], capture_output=True, text=True, timeout=20)
        if result.stdout.strip():
            return result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    print(f"Geen regio gevonden; ik ga uit van {REGION_FALLBACK}. Met --region kies je een andere.")
    return REGION_FALLBACK


def report_lines(report: Report) -> str:
    lines = report.lines()
    lines += [f"  ✓ {line}" for line in report.published]
    lines += [f"  − {line}" for line in report.removed]
    lines += [f"  · {line}" for line in report.notes]
    if report.site_url:
        lines.append("")
        lines.append(f"  Open {report.site_url} op je telefoon en kies 'Toevoegen aan beginscherm'.")
    return "\n".join(lines)


def command_destroy(deployer: Deployer, args: argparse.Namespace) -> int:
    if not args.yes:
        print("Dit haalt CloudFront, Lambda en de SSM-sleutel weg. Met --yes weet je het zeker.")
        return 1
    print(report_lines(deployer.destroy(purge=args.purge)))
    return 0


def command_key(deployer: Deployer) -> int:
    print(deployer.aws.read_room_key(deployer.site.room_key_parameter))
    return 0


def command_url(deployer: Deployer) -> int:
    url = deployer.terraform().outputs().site_url
    if not url:
        print("Nog niet live; draai 'python deploy/deploy.py up'.")
        return 1
    print(url)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        from galway_deploy.settings import Site

        site = Site.from_options(
            project=args.project,
            region=resolve_region(args.region),
            room=args.room,
            price_class=args.price_class,
        )
        aws = Aws(site.region, args.profile)
        deployer = Deployer(site, aws)
        if args.command in ("url", "key"):  # these two print one bare value
            return command_url(deployer) if args.command == "url" else command_key(deployer)
        print(f"Galway-trip → {site.project} in {site.region}, ruimte '{site.room}'.")

        if args.command in ("doctor", "status"):
            report = deployer.doctor() if args.command == "doctor" else deployer.status()
        elif args.command == "plan":
            report = deployer.up(plan_only=True)
        elif args.command in ("up", "infra"):
            report = deployer.infra() if args.command == "infra" else deployer.up(prune=args.prune)
        elif args.command == "assets":
            report = deployer.publish(prune=args.prune)
        else:
            return command_destroy(deployer, args)

        print(report_lines(report))
        return 0
    except ConfigError as error:
        detail = getattr(error, "detail", "")
        print(f"\nKan niet doorgaan: {error}")
        if detail:
            print(detail.strip()[-1500:])
        return 2
    except TerraformError as error:  # already a ConfigError subclass; kept for clarity
        print(f"\n{error}")
        print(error.detail.strip()[-2000:])
        return 2
    except NoRegionError:
        print("\nAWS kent geen regio. Geef --region op, bijvoorbeeld --region eu-central-1.")
        return 2
    except ProfileNotFound as error:
        print(f"\nDat AWS-profiel bestaat niet: {error}")
        return 2
    except ClientError as error:
        code = error.response["Error"].get("Code", "Error")
        print(f"\nAWS zei {code}: {error.response['Error'].get('Message', error)}")
        print("Rechten controleren: https://console.aws.amazon.com/iam/ · stack: https://console.aws.amazon.com/cloudformation/")
        return 3
    except KeyboardInterrupt:
        print("\nAfgebroken; alles is opnieuw uitvoerbaar, draai 'up' opnieuw.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
