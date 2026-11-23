#!/usr/bin/env python3
"""Deploy the Galway trip app to AWS.  See galway_deploy/cli.py for the commands."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from galway_deploy.cli import main  # noqa: E402 - path setup has to come first

if __name__ == "__main__":
    raise SystemExit(main())
