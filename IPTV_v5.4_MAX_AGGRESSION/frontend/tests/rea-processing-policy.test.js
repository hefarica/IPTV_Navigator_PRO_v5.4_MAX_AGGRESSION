#!/usr/bin/env node
'use strict';

/**
 * Deterministic contract/import regression tests, using the real certified LAB
 * and production modules. The VM supplies only localStorage/event interfaces;
 * none of these assertions claim physical HDR, measured FPS or playback QoE.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const JS = path.resolve(__dirname, '../js');
const builder = require(path.join(ROOT, 'tools/rea/build_processing_policy.js'));
const api = require(path.join(JS, 'ape-v9/rea-processing-policy.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
let passed = 0;

async function test(label, fn) {
    await fn();
    passed++;
    console.log('PASS ' + label);
}

function configContext(store, options = {}) {
    const quiet = { log() {}, warn() {}, error() {}, groupCollapsed() {}, groupEnd() {} };
    const ctx = {
        console: quiet,
        localStorage: {
            getItem: key => store.has(key) ? store.get(key) : null,
            setItem: (key, value) => store.set(key, String(value)),
            removeItem: key => store.delete(key)
        },
        dispatchEvent() {},
        CustomEvent: function (name, detail) { this.type = name; this.detail = detail; },
        setTimeout, clearTimeout
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    if (options.runtime !== false) vm.runInContext(fs.readFileSync(path.join(JS, 'ape-v9/rea-processing-policy.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(JS, 'ape-v9/ape-lab-v8-profiles.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(JS, 'ape-v9/ape-profiles-config.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(JS, 'ape-lab-import-helper.js'), 'utf8'), ctx);
    return ctx;
}

async function main() {
    const artifacts = builder.buildArtifacts();

    await test('browser runtime and overlay reproduce exactly from the contract', () => {
        assert.equal(fs.readFileSync(builder.RUNTIME_PATH, 'utf8'), artifacts.runtime);
        assert.deepEqual(JSON.parse(fs.readFileSync(builder.OVERLAY_PATH, 'utf8')), artifacts.overlay);
        assert.deepEqual(api.policy, artifacts.input.policy);
    });

    await test('derived LAB preserves every base field and explicitly identifies non-Excel extension', () => {
        const derivedBase = clone(artifacts.derivedLab);
        delete derivedBase.rea_processing;
        delete derivedBase.rea_provenance;
        // Compare digests so a failure cannot print any provider credentials.
        assert.equal(digest(derivedBase), digest(artifacts.input.lab));
        assert.equal(artifacts.overlay.base_lab.sha256, artifacts.input.baseSha256);
        assert.equal(artifacts.derivedLab.rea_provenance.exported_by_original_workbook, false);
        assert.equal(artifacts.derivedLab.rea_provenance.original_workbook_modified, false);
        assert.deepEqual(Object.keys(artifacts.derivedLab.profiles_calibrated), ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
    });

    const cases = [
        ['SD aspect preserved', 854, 480, 2560, 1438],
        ['720p to 1440p', 1280, 720, 2560, 1440],
        ['1080p to 2160p', 1920, 1080, 3840, 2160],
        ['1440p follows APK middle band', 2560, 1440, 3840, 2160],
        ['2160p to 3240p', 3840, 2160, 5760, 3240],
        ['8K stays native', 7680, 4320, 7680, 4320],
        ['portrait orientation preserved', 1080, 1920, 2160, 3840],
        ['4:3 stays 4:3', 640, 480, 1920, 1440],
        ['720 boundary', 720, 720, 1440, 1440],
        ['721 boundary', 721, 721, 2160, 2160],
        ['2159 boundary', 2159, 2159, 2160, 2160],
        ['2160 exact boundary', 2160, 2160, 3240, 3240],
        ['2161 stays native', 2161, 2161, 2161, 2161],
        ['wide source never downscales to fit a box', 16000, 720, 16000, 720]
    ];
    for (const [label, width, height, expectedWidth, expectedHeight] of cases) {
        await test(label, () => {
            const result = api.resolveTarget(width, height);
            assert.equal(result.valid, true);
            assert.equal(result.targetWidth, expectedWidth);
            assert.equal(result.targetHeight, expectedHeight);
            assert.ok(result.targetWidth >= width && result.targetHeight >= height);
            assert.equal(result.hdrVerified, false);
            assert.equal(result.processingStatus, 'requested_only');
        });
    }

    await test('missing/invalid decoded dimensions do not invent output dimensions', () => {
        for (const pair of [[0, 1080], [1920, -1], [NaN, 1080], [Infinity, 720], [12.5, 720], ['1920', 1080], [null, 1080]]) {
            const result = api.resolveTarget(...pair);
            assert.equal(result.valid, false);
            assert.equal(result.reason, 'invalid_dimensions');
            assert.equal(result.targetResolution, null);
        }
    });

    await test('runtime rejects a changed recipe and exposes an immutable request contract', () => {
        const changed = clone(api.policy);
        changed.resolution.rules[0].box_height = 2160;
        assert.equal(api.validatePolicy(changed).valid, false);
        const result = api.resolveTarget(1280, 720, changed);
        assert.equal(result.valid, false);
        assert.equal(result.targetResolution, '1280x720');
        assert.equal(result.reason, 'invalid_policy');
        assert.throws(() => { api.policy.resolution.rules[0].box_height = 1; }, TypeError);
    });

    await test('HDR declaration remains conditional and producer has consumer headroom', () => {
        assert.equal(api.policy.hdr.sdr_to_pq.minimum_android_api, 33);
        assert.equal(api.policy.hdr.sdr_to_pq.require_known_bt709_sdr, true);
        assert.equal(api.policy.hdr.sdr_to_pq.require_display_hdr10, true);
        assert.equal(api.policy.hdr.sdr_to_pq.require_compatible_egl_pq_output, true);
        assert.equal(api.policy.hdr.sdr_to_pq.require_10bit_output, true);
        assert.equal(api.policy.hdr.unsupported_native_hdr, 'native_playback');
        assert.equal(api.policy.hdr.metadata_alone_verifies_hdr, false);
        const headers = api.policy.transport.headers;
        assert.ok(headers.producer.max_count < headers.consumer_contract.max_count);
        assert.ok(headers.producer.max_total_json_utf8_bytes < headers.consumer_contract.max_total_utf8_bytes);
    });

    const storage = new Map();
    let context;
    await test('real certified LAB plus REA imports and exports the entire processing contract', async () => {
        context = configContext(storage);
        const result = await context.APE_PROFILES_CONFIG.importFromLABData(clone(artifacts.derivedLab));
        assert.equal(result.reaProcessingPolicyId, api.policy.policy_id);
        assert.equal(digest(context.APE_PROFILES_CONFIG.reaProcessing), digest(api.policy));
        const exported = context.APE_PROFILES_CONFIG.exportProfiles();
        assert.equal(digest(exported.rea_processing), digest(api.policy));
        assert.equal(exported.rea_provenance.source_lab_sha256, artifacts.input.baseSha256);
        assert.equal(context.apeLabStatus().reaProcessingPolicyId, api.policy.policy_id);
        assert.equal(context.APE_PROFILES_CONFIG.profiles.P3.settings.resolution, '1920x1080');
        assert.equal(context.APE_PROFILES_CONFIG.profiles.P4.settings.resolution, '1280x720');
    });

    await test('reload preserves imported values over embedded Excel values and rehydrates REA', () => {
        const stored = JSON.parse(storage.get('ape_profiles_v9'));
        // A distinct value proves precedence, not a measured frame rate.
        stored.P3.settings.fps = 47;
        storage.set('ape_profiles_v9', JSON.stringify(stored));
        context = configContext(storage);
        assert.equal(context.APE_LAB_V8_PROFILES.P3.settings.fps, 60);
        assert.equal(context.APE_PROFILES_CONFIG.profiles.P3.settings.fps, 47);
        assert.equal(digest(context.APE_PROFILES_CONFIG.reaProcessing), digest(api.policy));
        assert.equal(context.APE_PROFILES_CONFIG.labVersion, artifacts.input.lab.lab_version);
        assert.equal(context.apeLabStatus().ok, true);
    });

    await test('invalid LAB processing recipe rejects before mutating profiles/storage', async () => {
        const changed = clone(artifacts.derivedLab);
        changed.rea_processing.resolution.rules[0].box_height = 2160;
        const beforeProfiles = digest(context.APE_PROFILES_CONFIG.profiles);
        const beforeStorage = digest(Array.from(storage.entries()));
        await assert.rejects(context.APE_PROFILES_CONFIG.importFromLABData(changed), /Unsupported REA processing contract/);
        assert.equal(digest(context.APE_PROFILES_CONFIG.profiles), beforeProfiles);
        assert.equal(digest(Array.from(storage.entries())), beforeStorage);
    });

    await test('profile download/import roundtrip retains REA without requiring LAB source rewriting', () => {
        const exported = context.APE_PROFILES_CONFIG.exportProfiles();
        const restored = configContext(new Map());
        assert.equal(restored.APE_PROFILES_CONFIG.importProfiles(clone(exported)), true);
        assert.equal(digest(restored.APE_PROFILES_CONFIG.reaProcessing), digest(api.policy));
        assert.equal(restored.APE_PROFILES_CONFIG.profiles.P3.settings.fps, 47);
    });

    await test('legacy LAB import clears the prior overlay and remains valid', async () => {
        await context.APE_PROFILES_CONFIG.importFromLABData(clone(artifacts.input.lab));
        assert.equal(context.APE_PROFILES_CONFIG.reaProcessing, null);
        assert.equal(storage.get('ape_lab_rea_processing'), 'null');
        assert.equal(context.apeLabStatus().ok, true);
    });

    await test('corrupt persisted extension does not discard calibrated source profiles', () => {
        storage.set('ape_lab_rea_processing', '{');
        const reloaded = configContext(storage);
        assert.equal(reloaded.APE_PROFILES_CONFIG.reaProcessing, null);
        assert.equal(reloaded.APE_PROFILES_CONFIG.profiles.P3.settings.resolution, '1920x1080');
        assert.equal(reloaded.apeLabStatus().ok, true);
    });

    await test('missing runtime fails explicitly for REA LAB while legacy LAB still imports', async () => {
        const noRuntime = configContext(new Map(), { runtime: false });
        await assert.rejects(noRuntime.APE_PROFILES_CONFIG.importFromLABData(clone(artifacts.derivedLab)), /requires rea-processing-policy/);
        await noRuntime.APE_PROFILES_CONFIG.importFromLABData(clone(artifacts.input.lab));
        assert.equal(noRuntime.apeLabStatus().ok, true);
    });

    console.log(JSON.stringify({ passed, scope: 'contract_and_import_runtime', physical_device_verified: false }));
}

main().catch(error => {
    // Assertions concern public contract fields/digests; never dump raw LAB.
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
