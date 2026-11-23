"""Running Terraform for this repository.

Terraform plans and applies the AWS resources; this module only starts it,
reads the outputs back and turns its failures into something readable.  Local
state lives in infra/terraform.tfstate and is git-ignored because it holds the
room key.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from galway_deploy.settings import ConfigError

APPLY_TIMEOUT_SECONDS = 3600


@dataclass
class Outputs:
    """Terraform outputs, with friendly defaults when nothing is applied yet."""

    values: dict[str, str] = field(default_factory=dict)

    @property
    def site_url(self) -> str:
        return self.values.get("site_url", "")

    @property
    def api_url(self) -> str:
        return self.values.get("api_url", "")

    @property
    def distribution_id(self) -> str:
        return self.values.get("distribution_id", "")

    @property
    def table_name(self) -> str:
        return self.values.get("table_name", "")

    @property
    def bucket(self) -> str:
        return self.values.get("bucket", "")

    @property
    def room_key_parameter(self) -> str:
        return self.values.get("room_key_parameter", "")

    @property
    def applied(self) -> bool:
        return bool(self.site_url and self.api_url and self.distribution_id)


class Terraform:
    """Subprocess wrapper: init once, then apply/plan/destroy with our variables."""

    def __init__(self, directory: Path, variables: dict[str, str | list[str]], profile: str = "") -> None:
        self.directory = directory
        self.variables = variables
        self.profile = profile
        self._initialised = False

    # ---------------------------------------------------------------- plumbing

    def _binary(self) -> str:
        """Terraform, or OpenTofu when that is what is installed."""
        override = os.environ.get("TF_BINARY", "").strip()
        for candidate in (override, "terraform", "tofu"):
            if candidate and shutil.which(candidate):
                return shutil.which(candidate) or ""
        raise ConfigError(
            "Terraform is niet geïnstalleerd. Op macOS: brew install terraform "
            "(of: brew install opentofu, dat dit script ook vindt)."
        )

    def _variable_arguments(self) -> list[str]:
        """-var pairs, which terraform expects after the subcommand, not before it."""
        arguments: list[str] = []
        for key, value in self.variables.items():
            encoded = json.dumps(value) if isinstance(value, list) else str(value)
            arguments += ["-var", f"{key}={encoded}"]
        return arguments

    def _environment(self) -> dict[str, str]:
        environment = dict(os.environ)
        if self.profile:
            environment["AWS_PROFILE"] = self.profile
        return environment

    def _run(self, arguments: list[str], *, capture: bool = True, timeout: int = APPLY_TIMEOUT_SECONDS, variables: bool = True) -> str:
        command = [self._binary(), arguments[0]]
        if variables:
            command += self._variable_arguments()
        command += arguments[1:]
        try:
            result = subprocess.run(
                command,
                cwd=self.directory,
                env=self._environment(),
                capture_output=capture,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as error:
            raise ConfigError(f"Terraform {arguments[0]} duurde langer dan {timeout} seconden.") from error
        output = (result.stdout or "") + (result.stderr or "")
        if result.returncode != 0:
            raise TerraformError(arguments[0], output)
        return result.stdout if capture else ""

    def ensure_init(self) -> None:
        if self._initialised or (self.directory / ".terraform").is_dir():
            self._initialised = True
            return
        print("  terraform init (download providers, één keer)")
        self._run(["init", "-input=false", "-no-color"], variables=False)
        self._initialised = True

    # ----------------------------------------------------------------- actions

    def plan(self) -> str:
        self.ensure_init()
        return self._run(["plan", "-input=false", "-no-color"])

    def apply(self) -> Outputs:
        """Apply and wait; CloudFront creation takes several minutes the first time."""
        self.ensure_init()
        print("  terraform apply (CloudFront staat de eerste keer ~5 minuten op)")
        self._run(["apply", "-auto-approve", "-input=false", "-no-color"], capture=False)
        return self.outputs()

    def destroy(self) -> None:
        self.ensure_init()
        print("  terraform destroy")
        self._run(["destroy", "-auto-approve", "-input=false", "-no-color"], capture=False)

    def outputs(self) -> Outputs:
        self.ensure_init()
        try:
            raw = self._run(["output", "-json"], variables=False)
        except TerraformError as error:
            print(error.detail.strip()[-500:])
            return Outputs()
        try:
            parsed = json.loads(raw or "{}")
        except ValueError as error:
            raise ConfigError(f"Terraform gaf onleesbare outputs: {error}") from error
        return Outputs(values={key: item.get("value", "") for key, item in parsed.items()})


class TerraformError(ConfigError):
    """Terraform said no; the detail is its own output, kept verbatim."""

    def __init__(self, action: str, detail: str) -> None:
        super().__init__(f"terraform {action} mislukt. Uitsnede hieronder.")
        self.action = action
        self.detail = detail
