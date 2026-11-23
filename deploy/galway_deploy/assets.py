"""Publishing the app files into the Terraform-created bucket.

Why content types and cache headers matter here: CloudFront serves whatever the
object says.  A missing content type makes a phone download index.html instead
of running it, and a too-long max-age means a group keeps playing the previous
version of the game.  So both are set per file, and every publish invalidates
the distribution.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from botocore.exceptions import ClientError

from galway_deploy.settings import ConfigError, Site

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}

#: Files that define what the installed app is; always re-checked by the browser.
REVALIDATE = ("index.html", "duels.js", "config.js", "service-worker.js", "manifest.json")
CACHE_REVALIDATE = "public, max-age=0, must-revalidate"
CACHE_STABLE = "public, max-age=604800"


@dataclass(frozen=True)
class Upload:
    """One object destined for the bucket."""

    key: str
    body: bytes
    content_type: str
    cache_control: str

    @property
    def size(self) -> int:
        return len(self.body)


def content_type_for(key: str) -> str:
    suffix = Path(key).suffix.lower()
    if suffix not in CONTENT_TYPES:
        raise ConfigError(
            f"Onbekende content-type voor {key}. Voeg '{suffix}' toe aan CONTENT_TYPES in "
            "deploy/galway_deploy/assets.py, anders weigert de browser het bestand."
        )
    return CONTENT_TYPES[suffix]


def cache_control_for(key: str) -> str:
    return CACHE_REVALIDATE if Path(key).name in REVALIDATE else CACHE_STABLE


def planned_uploads(site: Site, config_js: str) -> list[Upload]:
    """The app files plus the generated config; nothing else is ever published."""
    uploads = [
        Upload(path.name, path.read_bytes(), content_type_for(path.name), cache_control_for(path.name))
        for path in site.app_files()
    ]
    uploads.append(Upload("config.js", config_js.encode("utf-8"), content_type_for("config.js"), cache_control_for("config.js")))
    return uploads


def stale_keys(present: Iterable[str], wanted: Iterable[str]) -> list[str]:
    """Objects a publish would leave behind."""
    keep = set(wanted)
    return sorted(key for key in present if key not in keep)


def summarize(uploads: list[Upload]) -> str:
    return f"{len(uploads)} bestanden, {sum(upload.size for upload in uploads):,} bytes"


class Bucket:
    """Object storage behind CloudFront, created by Terraform."""

    def __init__(self, s3_client: object) -> None:
        self._s3 = s3_client

    def exists(self, bucket: str) -> bool:
        try:
            self._s3.head_bucket(Bucket=bucket)
            return True
        except ClientError:
            return False

    def require(self, bucket: str) -> None:
        if not self.exists(bucket):
            raise ConfigError(
                f"Bucket {bucket} bestaat nog. Draai eerst 'python deploy/deploy.py up' "
                "(die start terraform apply)."
            )

    def publish(self, bucket: str, uploads: list[Upload]) -> list[str]:
        published = []
        for upload in uploads:
            self._s3.put_object(
                Bucket=bucket,
                Key=upload.key,
                Body=upload.body,
                ContentType=upload.content_type,
                CacheControl=upload.cache_control,
            )
            published.append(f"{upload.key} ({upload.size:,} bytes, {upload.cache_control})")
        return published

    def keys(self, bucket: str) -> list[str]:
        keys, token = [], None
        while True:
            page = (
                self._s3.list_objects_v2(Bucket=bucket, ContinuationToken=token)
                if token
                else self._s3.list_objects_v2(Bucket=bucket)
            )
            keys.extend(item["Key"] for item in page.get("Contents", []))
            if not page.get("IsTruncated"):
                return keys
            token = page["NextContinuationToken"]

    def prune(self, bucket: str, keys: list[str]) -> list[str]:
        if not keys:
            return []
        self._s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": key} for key in keys]}, Quiet=True)
        return keys

    def empty(self, bucket: str) -> int:
        if not self.exists(bucket):
            return 0
        keys = self.keys(bucket)
        for start in range(0, len(keys), 1000):
            self._s3.delete_objects(
                Bucket=bucket,
                Delete={"Objects": [{"Key": key} for key in keys[start : start + 1000]]},
                Quiet=True,
            )
        return len(keys)
