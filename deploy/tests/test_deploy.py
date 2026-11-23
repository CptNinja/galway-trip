"""Unit tests for the pure logic in the deploy package.

    .venv/bin/python -m unittest discover -s deploy/tests -t .

Terraform and the live AWS calls are not mocked here: those are checked against
the real account with ``deploy/deploy.py doctor`` and ``status``.
"""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from galway_deploy.assets import (  # noqa: E402
    CACHE_REVALIDATE,
    CACHE_STABLE,
    cache_control_for,
    content_type_for,
    planned_uploads,
    stale_keys,
)
from galway_deploy.settings import APP_FILES, ConfigError, Site, render_config  # noqa: E402
from galway_deploy.terraform import Outputs, Terraform  # noqa: E402


class FileRules(unittest.TestCase):
    def test_html_and_javascript_get_browser_types(self) -> None:
        self.assertTrue(content_type_for("index.html").startswith("text/html"))
        self.assertTrue(content_type_for("duels.js").startswith("text/javascript"))
        self.assertEqual(content_type_for("icon-192.png"), "image/png")

    def test_unknown_extension_is_refused_not_shipped_as_octet_stream(self) -> None:
        with self.assertRaises(ConfigError):
            content_type_for("notes.txt")

    def test_app_files_always_revalidate_and_icons_cache(self) -> None:
        self.assertEqual(cache_control_for("index.html"), CACHE_REVALIDATE)
        self.assertEqual(cache_control_for("service-worker.js"), CACHE_REVALIDATE)
        self.assertEqual(cache_control_for("icon-512.png"), CACHE_STABLE)

    def test_prune_only_lists_files_that_are_not_published(self) -> None:
        self.assertEqual(stale_keys(["old.js", "index.html"], ["index.html"]), ["old.js"])


class Publishing(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = Path(tempfile.mkdtemp(prefix="galway-test-"))
        self.addCleanup(shutil.rmtree, self.directory, True)
        for name in APP_FILES:
            if name != "config.js":
                (self.directory / name).write_text(f"// {name}\n")
        self.site = Site.from_options(region="eu-central-1")
        self.site = Site(project="galway-trip", region="eu-central-1", room="galway", root=self.directory)

    def test_config_is_rendered_from_the_stack_instead_of_read_from_disk(self) -> None:
        uploads = planned_uploads(self.site, render_config(api="https://api.example", room="galway", key="secret"))
        config = next(upload for upload in uploads if upload.key == "config.js")
        self.assertIn('api: "https://api.example"', config.body.decode())
        self.assertIn('key: "secret"', config.body.decode())
        self.assertNotIn("window.GALWAY_CONFIG = Object.freeze({\n  api: \"\"", config.body.decode())

    def test_the_local_config_file_is_never_published(self) -> None:
        (self.directory / "config.js").write_text(render_config(api="", room="galway", key=""))
        uploads = planned_uploads(self.site, render_config(api="https://api.example", room="x", key="k"))
        self.assertEqual(len([upload for upload in uploads if upload.key == "config.js"]), 1)
        self.assertTrue(all("api: \"https://api.example\"" in upload.body.decode() for upload in uploads if upload.key == "config.js"))

    def test_missing_app_file_stops_the_publish(self) -> None:
        (self.directory / "duels.js").unlink()
        with self.assertRaises(ConfigError):
            planned_uploads(self.site, "x")


class Settings(unittest.TestCase):
    def test_site_needs_a_region_before_anything_else(self) -> None:
        with self.assertRaises(ConfigError):
            Site.from_options(region="")

    def test_room_names_are_kept_dns_safe(self) -> None:
        for bad in ("", "Galway 2026", "-room", "room_key", "r" * 41):
            with self.assertRaises(ConfigError, msg=bad):
                Site.from_options(region="eu-central-1", room=bad)

    def test_terraform_receives_the_variables_it_declares(self) -> None:
        variables = Site.from_options(region="eu-west-1", price_class="PriceClass_200").terraform_vars()
        self.assertEqual(variables["region"], "eu-west-1")
        self.assertEqual(variables["price_class"], "PriceClass_200")
        self.assertIn("http://127.0.0.1:8765", variables["dev_origins"])

    def test_names_match_the_terraform_locals(self) -> None:
        site = Site.from_options(region="eu-central-1")
        self.assertEqual(site.room_key_parameter, "/galway-trip/room-key")
        self.assertEqual(site.table_name, "galway-trip-room")


class TerraformArguments(unittest.TestCase):
    @unittest.skipIf(shutil.which("terraform") is None, "terraform not installed")
    def test_list_variables_are_encoded_as_json(self) -> None:
        terraform = Terraform(Path("."), {"region": "eu-central-1", "dev_origins": ["http://a", "http://b"]})
        arguments = terraform._variable_arguments()
        self.assertIn('-var', arguments)
        self.assertIn('dev_origins=["http://a", "http://b"]', arguments)

    def test_outputs_expose_defaults_before_a_first_apply(self) -> None:
        outputs = Outputs(values={"site_url": "https://x.cloudfront.net/"})
        self.assertEqual(outputs.site_url, "https://x.cloudfront.net/")
        self.assertEqual(outputs.distribution_id, "")
        self.assertFalse(outputs.applied)


if __name__ == "__main__":
    unittest.main()
