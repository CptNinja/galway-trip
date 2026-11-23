"""Deployment settings: one place that turns CLI options into an immutable plan.

Terraform owns the AWS resources; this package owns what Terraform cannot do
comfortably: rendering the runtime config, uploading files with the right
content type and cache header, and asking CloudFront to forget the old version.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
INFRA_DIR = REPO_ROOT / "infra"

#: Everything that makes up the installed app; the rest of the repo stays local.
APP_FILES = (
    "index.html",
    "duels.js",
    "sync.js",
    "config.js",
    "manifest.json",
    "service-worker.js",
    "icon-192.png",
    "icon-512.png",
)

#: Origins the sync API answers besides the live site, so local dev keeps working.
DEV_ORIGINS = ("http://127.0.0.1:8765", "http://localhost:8765")

PRICE_CLASSES = ("PriceClass_100", "PriceClass_200", "PriceClass_All")

#: Key the local dev server accepts; loopback only, so no secret and no churn.
LOCAL_ROOM_KEY = "lokale-ontwikkeling"


class ConfigError(RuntimeError):
    """The deployment cannot start; the message says what to change."""


@dataclass(frozen=True)
class Site:
    """One deployed trip app."""

    project: str = "galway-trip"
    region: str = ""
    room: str = "galway"
    price_class: str = "PriceClass_100"
    root: Path = field(default=REPO_ROOT, compare=False)

    @classmethod
    def from_options(
        cls,
        project: str = "galway-trip",
        region: str = "",
        room: str = "galway",
        price_class: str = "PriceClass_100",
    ) -> Site:
        """Fill in the region the way the AWS CLI would, then validate everything."""
        resolved = region or os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or ""
        site = cls(project=project, region=resolved, room=room.lower().strip(), price_class=price_class)
        site.validate()
        return site

    def validate(self) -> None:
        if not self.region:
            raise ConfigError(
                "Geen AWS-regio gevonden. Geef --region op of stel AWS_REGION in; "
                "te vinden met: aws configure get region"
            )
        if self.price_class not in PRICE_CLASSES:
            raise ConfigError(f"price_class moet een van {PRICE_CLASSES} zijn, niet {self.price_class!r}.")
        if not _room_ok(self.room):
            raise ConfigError(f"room {self.room!r} moet voldoen aan ^[a-z0-9][a-z0-9-]{{0,39}}$.")

    # ------------------------------------------------------------- addresses

    @property
    def table_name(self) -> str:
        return f"{self.project}-room"

    @property
    def room_key_parameter(self) -> str:
        """SSM SecureString with the shared key, created and kept by Terraform."""
        return f"/{self.project}/room-key"

    @property
    def terraform_dir(self) -> Path:
        return INFRA_DIR

    @property
    def dev_origins(self) -> list[str]:
        return list(DEV_ORIGINS)

    def terraform_vars(self) -> dict[str, str | list[str]]:
        """The -var arguments Terraform needs for this site."""
        return {
            "region": self.region,
            "project": self.project,
            "price_class": self.price_class,
            "dev_origins": self.dev_origins,
        }

    # ------------------------------------------------------------------ files

    def app_files(self) -> list[Path]:
        paths = [self.root / name for name in APP_FILES if name != "config.js"]
        missing = [path.name for path in paths if not path.is_file()]
        if missing:
            raise ConfigError(f"Appbestanden ontbreken in {self.root}: {', '.join(missing)}")
        return paths

    def local_config(self) -> str:
        """config.js served by the local dev server: same-origin /api, dev key."""
        return render_config(api="/api", room=self.room, key=LOCAL_ROOM_KEY)

    def production_config(self, api_url: str, key: str) -> str:
        """config.js as published to S3: absolute API URL plus the shared key."""
        if not key:
            raise ConfigError("Geen roomsleutel gevonden; draai eerst 'terraform apply' via 'up'.")
        return render_config(api=api_url.rstrip("/"), room=self.room, key=key)


def render_config(api: str, room: str, key: str) -> str:
    """The runtime config the app reads; identical shape local and in the cloud."""
    return (
        "// Instellingen voor de sync-verbinding, door de deploy-stappen gegenereerd.\n"
        "// Lokaal serveert lokale_testserver.py deze tekst; deploy/deploy.py publiceert de AWS-versie.\n"
        "// Een lege api betekent: helemaal lokaal werken, geen sync.\n"
        "window.GALWAY_CONFIG = Object.freeze({\n"
        f'  api: "{api}",\n'
        f'  room: "{room}",\n'
        f'  key: "{key}",\n'
        "  syncIntervalMs: 20000,\n"
        "});\n"
    )


def _room_ok(room: str) -> bool:
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-")
    return bool(room) and room[0].isalnum() and set(room) <= allowed and len(room) <= 40
