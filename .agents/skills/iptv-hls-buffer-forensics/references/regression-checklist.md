# Regression checklist for buffer and TARGETDURATION changes

## Contents

1. Isolation
2. Patch composition
3. Contract tests
4. Existing suites
5. Static checks
6. Evidence and limits

## 1. Isolation

Never test on the production clone, the deployed VPS, the APK or the user's private list.

```bash
git worktree add --detach /tmp/check HEAD
cd /tmp/check
```

If the repository uses sparse checkout for a previous patch, add the generator, JIT and LAB paths explicitly or use a full worktree. A sparse copy that only contains the patched files cannot test the generator.

## 2. Patch composition

Apply the previous patch first, then the new one. Check both before applying:

```bash
git apply --check previous.patch
git apply previous.patch
git apply --check buffer.patch
git apply buffer.patch
```

Generate the new patch without ANSI color:

```bash
git --no-pager diff --no-color --binary -- \
  path/to/generator.js path/to/server.js > buffer.patch
git --no-pager diff --no-color --no-index -- /dev/null path/to/test.js >> buffer.patch || true
```

Verify:

```bash
git apply --check --reverse buffer.patch   # matches the applied state
grep -c $'\x1b' buffer.patch               # must be 0
```

If the patch contains an end-of-file hunk that only deletes blank lines, restore the original trailing newlines and regenerate. Noise in the patch makes review harder and can hide a real change.

## 3. Contract tests

Use `scripts/check_buffer_contract.js` with the real generator, JIT and LAB:

```bash
node scripts/check_buffer_contract.js \
  --generator path/to/m3u8-typed-arrays-ultimate.js \
  --jit path/to/ape-jit/server.js \
  --lab path/to/APE_LAB_CANONICAL_BULLETPROOF.json \
  --segments 2,4,6
```

Required assertions:

- `resolveTargetDuration` is exported.
- 2, 4 and 6 s resolve to 2, 4 and 6.
- 4.5 resolves to 5.
- Empty, null, negative and text fall back to 2.
- The emitted `TARGETDURATION` matches the segment in MAX_QUALITY.
- `load_control` is 30000 / 3000 / 90000 in MAX_QUALITY, default and LAB paths.
- The default buffer strategy is 15 / 24 / 48.
- The source has no literal `#EXT-X-TARGETDURATION:2`.
- The JIT has a 24 s floor, 62.5 % minimum and a dynamic segment header.

Add a negative fixture: a temporary file with `#EXT-X-TARGETDURATION:2` and `segment_duration: 4` must produce a `TARGETDURATION_STALE` finding from `audit_hls_buffer.py`.

## 4. Existing suites

Run the repository's own suites, not only the new test. A generator change can break the panel, the queue worker or the conformance contract even when the new unit test passes.

Typical set:

```bash
php -d memory_limit=32M tools/quality/test_cablear_engine.php
node tools/quality/test_list_cablear_panel.js
bash vps/bin/ape-cablear-queue-worker.test.sh
php tools/quality/test_crystal_flow_conformance.php
php tools/quality/test_cmaf_copy.php --fixture fixture.mkv --codec-tag hvc1
```

Report the exact counts. Do not say "all tests pass" without the PASS/FAIL numbers.

## 5. Static checks

```bash
php -l file.php
bash -n script.sh
node --check file.js
shellcheck -S error script.sh
git diff --check
```

Also check that the patch applies cleanly on a clean HEAD plus the previous patch, not only in the working copy where the changes were authored.

## 6. Evidence and limits

Deliver:

- the incremental patch;
- a short report with the exact values, test counts and patch SHA-256;
- the new regression test;
- a list of what was not applied.

Declare separately:

- static source audit;
- unit/contract tests;
- local multimedia fixture;
- deployment to APK/SHIM/VPS;
- per-channel overrides;
- production list changes.

Do not claim that a manifest change was deployed, that a per-channel override was applied, or that a local fixture proves provider behavior.
