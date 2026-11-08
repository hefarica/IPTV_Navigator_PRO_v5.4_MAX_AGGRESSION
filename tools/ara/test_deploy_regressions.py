#!/usr/bin/env python3
"""Local regressions for real Bash filters and workflow predicates.

Runs only extracted, side-effect-free source fragments on explicit byte fixtures.
Does not start the worker, replace adb/PHP/curl, contact a VPS, or prove playback.
Use --git-ref HEAD to exercise the same cases against the unpatched source.
Requires Python 3 and the Bash, awk, grep, sha256sum and cut CLI tools.
"""

import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKER = "IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/ara-device-worker.sh"
WORKFLOW = ".github/workflows/ape-deploy-frontend.yml"
INDEX = "IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html"
ARGS = argparse.ArgumentParser(description=__doc__)
ARGS.add_argument("--git-ref", help="read production sources at this git revision")
OPTIONS, UNITTEST_ARGS = ARGS.parse_known_args()


def read_source(path):
    if OPTIONS.git_ref:
        return subprocess.check_output(
            ["git", "show", f"{OPTIONS.git_ref}:{path}"], cwd=ROOT
        ).decode("utf-8")
    return (ROOT / path).read_text(encoding="utf-8")


worker = read_source(WORKER)
workflow = read_source(WORKFLOW)
index_bytes = read_source(INDEX).encode("utf-8")


def between(source, start, end):
    return source.split(start, 1)[1].split(end, 1)[0]


def shell(code, values=None, stdin=""):
    return subprocess.run(
        ["bash", "-euo", "pipefail", "-c", code],
        input=stdin, text=True, capture_output=True,
        env={**os.environ, **(values or {})}, timeout=10, cwd=ROOT,
    )


class WorkerRegressionTests(unittest.TestCase):
    def test_version_code_is_a_numeric_token(self):
        body = between(worker, "pkg_version_code() {", "\n}")
        # Execute the actual tr/awk filter, without the adb transport command.
        pipeline = body[body.index("| tr -d"):].lstrip("| ")
        cases = {
            "android_fields": ("    versionCode=651 minSdk=22 targetSdk=28\n", "651"),
            "crlf": ("    versionCode=652 minSdk=22 targetSdk=28\r\n", "652"),
            "bare": ("versionCode=52\n", "52"),
            "tabs": ("\tversionCode=652\tminSdk=22\n", "652"),
            "missing": ("Unable to find package\n", ""),
            "invalid": ("versionCode=broken minSdk=22\n", ""),
            "trailing_junk": ("versionCode=651oops minSdk=22\n", ""),
            "other_field": ("not_versionCode=9\n", ""),
        }
        for name, (dump, expected) in cases.items():
            with self.subTest(name=name):
                result = shell(pipeline, stdin=dump)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), expected)

    def test_missing_package_error_expands_under_nounset(self):
        verdict = worker.split("# ── Veredicto:", 1)[1]
        branch = between(verdict, '    if [ -z "$after" ]; then', "\n    fi")
        message = re.search(r'("adb install[^\n]*?") "\$before_json"', branch)
        self.assertIsNotNone(message, "Missing-install terminal message not found")
        # Expand the production message with Bash nounset; no terminal writer is faked.
        result = shell("unset iout\nprintf '%s\\n' " + message.group(1))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no dejo el paquete instalado", result.stdout)


class WorkflowRegressionTests(unittest.TestCase):
    def pulse(self, body, status="200", error='{"ok":false,"format":"unknown"}', error_status="502"):
        block = "OK_A=0; OK_B=0" + between(
            workflow, "OK_A=0; OK_B=0", 'echo "  SMOKE A'
        )
        result = shell(textwrap.dedent(block) + '\nprintf "%s %s" "$OK_A" "$OK_B"', {
            "SM_A": body, "SM_A_STATUS": status,
            "SM_B": error, "SM_B_STATUS": error_status,
        })
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def test_master_to_media_requires_media_structure_and_http_success(self):
        media = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.000,\nsegment.ts\n"
        cases = {
            "media": (media, "200", "1 1"),
            "media_crlf": (media.replace("\n", "\r\n"), "200", "1 1"),
            "master": ("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvariant.m3u8\n", "200", "0 1"),
            "header_only": ("#EXTM3U\n", "200", "0 1"),
            "missing_header": ("#EXTINF:6.000,\nsegment.ts\n", "200", "0 1"),
            "mixed": (media + "#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvariant.m3u8\n", "200", "0 1"),
            "missing_target_duration": (media.replace("#EXT-X-TARGETDURATION:6\n", ""), "200", "0 1"),
            "missing_segment": (media.replace("segment.ts\n", ""), "200", "0 1"),
            "http_error": (media, "502", "0 1"),
            "html": ("<html>error</html>", "200", "0 1"),
        }
        for name, (body, status, expected) in cases.items():
            with self.subTest(name=name):
                self.assertEqual(self.pulse(body, status), expected)

    def test_negative_smoke_requires_502_and_valid_classifier_json(self):
        media = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.000,\nsegment.ts\n"
        cases = {
            "wrong_status": ('{"ok":false,"format":"unknown"}', "200"),
            "invalid_json": ('<html>"format"</html>', "502"),
            "wrong_type": ('{"ok":false,"format":true}', "502"),
            "not_error": ('{"ok":true,"format":"unknown"}', "502"),
        }
        for name, (body, status) in cases.items():
            with self.subTest(name=name):
                self.assertEqual(self.pulse(media, error=body, error_status=status), "1 0")

    def index(self, body, status="200", expected=None):
        block = "OK_I=0" + between(workflow, "OK_I=0", 'echo "  SMOKE index')
        with tempfile.TemporaryDirectory(prefix="ara-index-regression-") as directory:
            path = Path(directory) / "index.html"
            path.write_bytes(body)
            result = shell('IDX=$(cat "$IDX_FILE")\n' + textwrap.dedent(block) + '\nprintf "%s" "$OK_I"', {
                "IDX_FILE": str(path),
                "IDX_STATUS": status,
                "L8": hashlib.sha256(index_bytes if expected is None else expected).hexdigest(),
            })
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def test_index_requires_all_scripts_complete_html_and_http_hash(self):
        no_panel = index_bytes.replace(b"generation-output-panel.js?v=", b"absent.js?v=")
        no_controller = index_bytes.replace(b"generation-controller.js?v=", b"absent.js?v=")
        no_end = index_bytes.replace(b"</html>", b"")
        cases = {
            "current": (index_bytes, "200", None, "1"),
            "closing_tag_only": (b"</html>\n", "200", None, "0"),
            "stale_cache": (index_bytes.replace(b"20261106-ready", b"20260101-old"), "200", None, "0"),
            "changed_bytes": (b"<!-- old cache -->\n" + index_bytes, "200", None, "0"),
            "missing_panel": (no_panel, "200", no_panel, "0"),
            "missing_controller": (no_controller, "200", no_controller, "0"),
            "missing_html_end": (no_end, "200", no_end, "0"),
            "http_error": (index_bytes, "503", None, "0"),
        }
        for name, (body, status, expected, verdict) in cases.items():
            with self.subTest(name=name):
                self.assertEqual(self.index(body, status, expected), verdict)


if __name__ == "__main__":
    print(f"Local source checks only; source={OPTIONS.git_ref or 'working-tree'}", flush=True)
    unittest.main(argv=[__file__, *UNITTEST_ARGS])
