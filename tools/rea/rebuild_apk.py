#!/usr/bin/env python3
"""Rebuild the REA overlay from the pinned supplied APK, outside the checkout.

Linux, Python 3 and Java 17 are required. Signing material is supplied by the
owner and is never part of this repository. This command does not install or
publish anything and refuses to reuse a non-empty work directory.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

HERE = Path(__file__).resolve().parent
BASE_SHA256 = '8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4'


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def provision_tools(target):
    target.mkdir(parents=True, exist_ok=True)
    for entry in json.loads((HERE / 'apk_overlay/build-inputs.json').read_text()):
        if entry['file'] == 'jadx.zip':
            continue  # An audit/decompiler input; not needed for rebuilding.
        artifact = target / entry['file']
        if not artifact.exists():
            temporary = artifact.with_suffix(artifact.suffix + '.download')
            try:
                with urllib.request.urlopen(entry['url'], timeout=60) as response, temporary.open('wb') as output:
                    shutil.copyfileobj(response, output)
                if sha256(temporary) != entry['sha256']:
                    raise RuntimeError('Build input hash mismatch: ' + entry['file'])
                temporary.rename(artifact)
            finally:
                temporary.unlink(missing_ok=True)
        if sha256(artifact) != entry['sha256']:
            raise RuntimeError('Build input hash mismatch: ' + entry['file'])
        if artifact.suffix == '.aar':
            with zipfile.ZipFile(artifact) as archive:
                artifact.with_suffix('.jar').write_bytes(archive.read('classes.jar'))
        elif entry['file'] in ('platform.zip', 'build-tools.zip'):
            destination = target / 'sdk'
            destination.mkdir(exist_ok=True)
            with zipfile.ZipFile(artifact) as archive:
                for member in archive.infolist():
                    if not (destination / member.filename).resolve().is_relative_to(destination.resolve()):
                        raise RuntimeError('Invalid SDK archive path')
                archive.extractall(destination)
    for filename in ('aapt2', 'aapt', 'zipalign', 'dexdump'):
        binary = target / 'sdk/android-14' / filename
        if binary.exists():
            binary.chmod(0o755)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-apk', required=True, type=Path)
    parser.add_argument('--work-dir', required=True, type=Path)
    parser.add_argument('--tools-dir', type=Path, help='Reuse a previously verified tool cache')
    parser.add_argument('--keystore', required=True, type=Path, help='Owner PKCS12 key, alias ape-rea')
    parser.add_argument('--password-file', required=True, type=Path)
    args = parser.parse_args()
    work = args.work_dir.resolve()
    repo = HERE.parents[1]
    if work.is_relative_to(repo):
        raise RuntimeError('Use a private work directory outside the git checkout')
    if work.exists() and any(work.iterdir()):
        raise RuntimeError('Work directory is not empty; choose a new directory')
    if sha256(args.base_apk) != BASE_SHA256:
        raise RuntimeError('Base APK differs from the audited version 651')
    for secret in (args.keystore, args.password_file):
        if not secret.is_file():
            raise RuntimeError('Required signing file is unavailable')
    work.mkdir(mode=0o700, parents=True, exist_ok=True)
    shutil.copyfile(args.base_apk, work / 'input.apk')
    shutil.copytree(HERE / 'apk_overlay', work / 'integration', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    if args.tools_dir:
        tools = args.tools_dir.resolve()
        # Validate the pinned archives before reusing derived SDK/jar inputs.
        provision_tools(tools)
        (work / 'tools').symlink_to(tools, target_is_directory=True)
    else:
        provision_tools(work / 'tools')
    signing = work / 'signing'
    signing.mkdir(mode=0o700)
    for source, name in ((args.keystore, 'ape-rea-test.p12'), (args.password_file, 'password.txt')):
        destination = signing / name
        shutil.copyfile(source, destination)
        destination.chmod(0o600)
    # The audited smali fingerprints deliberately exclude line/local debug data.
    # Match that decoding mode; keep every original-byte guard in the patches.
    subprocess.run(['java', '-jar', str(work / 'tools/apktool.jar'), 'd', '--no-debug-info', str(work / 'input.apk'),
                    '-o', str(work / 'apk')], check=True)
    for filename in ('apply_hdr_patch.py', 'apply_host_ott_patch.py', 'clone_identity.py', 'build_java.py', 'package_apk.py'):
        subprocess.run(['python3', str(work / 'integration' / filename)], check=True, cwd=work.parent)
    print(json.dumps({'completed': True, 'work_dir': str(work), 'output_directory': str(work.parent / 'deliverables'),
                      'installed': False, 'published': False, 'physical_playback_tested': False}))


if __name__ == '__main__':
    main()
