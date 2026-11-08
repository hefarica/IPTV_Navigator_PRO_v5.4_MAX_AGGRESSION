#!/usr/bin/env python3
"""Run only real confirmation scripts locally; never SSH or deploy.

Also verifies the deploy asset inventory and commit pin. Requires PyYAML.
"""
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/ape-deploy-frontend.yml'
DOC = yaml.safe_load(WORKFLOW.read_text())
FRONT = ROOT / 'IPTV_v5.4_MAX_AGGRESSION/frontend'
LITERAL = 'DESPLIEGO EL GENERADOR AL VPS'


class ConfirmationSecurity(unittest.TestCase):
    def test_confirmation_is_data_in_both_jobs(self):
        count = 0
        for job in DOC['jobs'].values():
            for step in job.get('steps', []):
                if step.get('name') != 'Exigir la confirmacion literal':
                    continue
                count += 1
                script = step['run']
                self.assertNotIn('${{', script)
                self.assertEqual(step['env']['DEPLOY_CONFIRMATION'], '${{ inputs.confirm }}')
                self.assertEqual(step['if'], "inputs.mode == 'apply'")
                for value, expected in [(LITERAL, 0), ('', 1), ('apply', 1), (LITERAL + '\n', 1),
                    ('$(printf S10_EXECUTED >&2)', 1), ('`printf S10_EXECUTED >&2`', 1),
                    ('"; printf S10_EXECUTED >&2; #', 1), ('${PATH}', 1)]:
                    with self.subTest(value=value, job=count):
                        result = subprocess.run(['bash', '-c', script], cwd=ROOT,
                            env={**os.environ, 'DEPLOY_CONFIRMATION': value}, text=True,
                            capture_output=True, timeout=5)
                        self.assertEqual(result.returncode, expected)
                        self.assertNotIn('S10_EXECUTED', result.stderr)
        self.assertEqual(count, 2)

    def test_workflow_is_manual_and_both_jobs_pin_same_dispatch_commit(self):
        triggers = DOC.get('on', DOC.get(True))
        self.assertEqual(set(triggers), {'workflow_dispatch'})
        for job in DOC['jobs'].values():
            checkouts = [s for s in job['steps'] if str(s.get('uses', '')).startswith('actions/checkout@')]
            self.assertEqual(len(checkouts), 1)
            self.assertEqual(checkouts[0]['with']['ref'], '${{ github.sha }}')

    def test_asset_inventory_includes_shared_modules_and_all_emitters(self):
        env = DOC['jobs']['desplegar']['env']
        assets = env['FICHEROS'].split()
        self.assertEqual(len(assets), len(set(assets)))
        self.assertEqual(env['SRC_DIR'], str(FRONT.relative_to(ROOT)))
        self.assertEqual(env['DEST_DIR'], '/var/www/html')
        required = {'app.js', 'export-module.js', 'js/ape-worker.js', 'js/ape-lab-import-helper.js',
            'js/m3u8-world-class-generator.js', 'js/m3u8-generator-v16-elite.js'}
        required.update('js/ape-v9/' + name for name in [
            'rea-processing-policy.js', 'rea-export-finalizer.js', 'rea-catalog-export.js',
            'ape-profiles-config.js', 'ape-quality-prober.js', 'm3u8-typed-arrays-ultimate.js',
            'generation-controller.js', 'generation-output-panel.js',
            'unified-generator-integration.js', 'm3u8-api-wrapper-integrated.js'])
        self.assertTrue(required.issubset(set(assets)))
        for item in assets:
            self.assertFalse(PurePosixPath(item).is_absolute())
            self.assertNotIn('..', PurePosixPath(item).parts)
            self.assertTrue((FRONT / item).is_file(), item)
        html = (FRONT / 'index-v4.html').read_text()
        scripts = re.findall(r'<script\b[^>]*\bsrc="([^"?]+)', html)
        for item in required - {'js/ape-worker.js'}:
            self.assertEqual(scripts.count(item), 1, item)
        self.assertLess(scripts.index('js/ape-v9/rea-processing-policy.js'), scripts.index('js/ape-v9/ape-profiles-config.js'))
        self.assertLess(scripts.index('js/ape-v9/rea-export-finalizer.js'), scripts.index('js/ape-v9/rea-catalog-export.js'))

    def test_http_checks_reference_downloaded_asset_paths(self):
        job = DOC['jobs']['desplegar']
        downloaded = {'/tmp/s-' + item.replace('/', '_') for item in job['env']['FICHEROS'].split()}
        scripts = '\n'.join(step.get('run', '') for step in job['steps'])
        references = re.findall(r'^\s*[GPCM]=(/tmp/s-[^\s]+)', scripts, flags=re.MULTILINE)
        self.assertEqual(len(references), 4)
        self.assertTrue(set(references).issubset(downloaded), set(references) - downloaded)


if __name__ == '__main__':
    unittest.main()
