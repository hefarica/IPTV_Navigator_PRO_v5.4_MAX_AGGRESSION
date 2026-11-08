#!/usr/bin/env node
'use strict';

/**
 * Reproducible REA extension. The calibrated LAB and its source profiles are
 * never edited. Default outputs are a browser/CommonJS runtime and a small LAB
 * overlay; --lab-output <path> materializes an importable derived LAB on demand.
 * No current timestamp, host, credential or measured-performance claim is added.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const CONTRACT_PATH = path.join(ROOT, 'contracts/rea/rea-processing-v1.json');
const RUNTIME_PATH = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/rea-processing-policy.js');
const OVERLAY_PATH = path.join(ROOT, 'contracts/lab/APE_LAB_REA_PROCESSING_OVERLAY_v1.json');

// Kept as a single factory so the browser bundle and Node consumer execute the
// same implementation. The generated runtime receives only the public contract.
function createRuntime(inputPolicy) {
    'use strict';
    function freezeDeep(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.keys(value).forEach(function (key) { freezeDeep(value[key]); });
            Object.freeze(value);
        }
        return value;
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    const policy = freezeDeep(clone(inputPolicy));

    function matchesRequired(expected, actual, prefix, errors) {
        if (expected && typeof expected === 'object') {
            if (!actual || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) {
                errors.push(prefix + ': incompatible contract shape');
                return;
            }
            if (Array.isArray(expected) && expected.length !== actual.length) {
                errors.push(prefix + ': incompatible contract length');
                return;
            }
            Object.keys(expected).forEach(function (key) {
                matchesRequired(expected[key], actual[key], prefix + '.' + key, errors);
            });
        } else if (expected !== actual) {
            errors.push(prefix + ': unsupported contract value');
        }
    }

    function validatePolicy(candidate) {
        const errors = [];
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return { valid: false, errors: ['rea_processing: expected an object'] };
        }
        // A changed processing recipe requires a matching runtime/APK revision.
        // Extra provenance fields may travel with the approved contract.
        matchesRequired(policy, candidate, 'rea_processing', errors);
        return { valid: errors.length === 0, errors: errors };
    }

    function resolveTarget(width, height, candidatePolicy) {
        const selected = candidatePolicy === undefined ? policy : candidatePolicy;
        const check = validatePolicy(selected);
        const dimensionsValid = Number.isSafeInteger(width) && width > 0 &&
            Number.isSafeInteger(height) && height > 0;
        const sourceWidth = dimensionsValid ? width : null;
        const sourceHeight = dimensionsValid ? height : null;
        const result = {
            valid: dimensionsValid && check.valid,
            policyId: policy.policy_id,
            sourceWidth: sourceWidth,
            sourceHeight: sourceHeight,
            shortSide: dimensionsValid ? Math.min(width, height) : null,
            boxWidth: sourceWidth,
            boxHeight: sourceHeight,
            targetWidth: sourceWidth,
            targetHeight: sourceHeight,
            sourceResolution: dimensionsValid ? width + 'x' + height : null,
            targetResolution: dimensionsValid ? width + 'x' + height : null,
            enhancementRequested: false,
            mode: 'native_passthrough',
            reason: !dimensionsValid ? 'invalid_dimensions' : (!check.valid ? 'invalid_policy' : 'native_above_max_source'),
            hdrMode: policy.hdr.mode,
            hdrVerified: false,
            processingStatus: 'requested_only'
        };
        if (!result.valid) return result;
        const rule = selected.resolution.rules.find(function (entry) {
            return result.shortSide >= entry.min_short_side && result.shortSide <= entry.max_short_side;
        });
        if (!rule) return result;
        const portrait = height > width;
        result.boxWidth = portrait ? rule.box_height : rule.box_width;
        result.boxHeight = portrait ? rule.box_width : rule.box_height;
        const scale = Math.max(1, Math.min(result.boxWidth / width, result.boxHeight / height));
        const epsilon = selected.resolution.rounding_epsilon;
        result.targetWidth = Math.max(width, Math.floor(width * scale + epsilon));
        result.targetHeight = Math.max(height, Math.floor(height * scale + epsilon));
        result.targetResolution = result.targetWidth + 'x' + result.targetHeight;
        result.enhancementRequested = result.targetWidth > width || result.targetHeight > height;
        result.mode = result.enhancementRequested ? 'upscale_request' : 'native_passthrough';
        result.reason = result.enhancementRequested ? 'upscale_requested' : 'native_to_avoid_downscale';
        return result;
    }

    return Object.freeze({ policy: policy, resolveTarget: resolveTarget, validatePolicy: validatePolicy });
}

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function json(value) { return JSON.stringify(value, null, 2) + '\n'; }
function readInputs() {
    const contractBytes = fs.readFileSync(CONTRACT_PATH);
    const policy = JSON.parse(contractBytes.toString('utf8'));
    if (policy.schema_version !== 1 || !policy.resolution || !Array.isArray(policy.resolution.rules)) {
        throw new Error('Unsupported REA contract schema');
    }
    const labPath = path.resolve(ROOT, policy.source_lab.path);
    const labBytes = fs.readFileSync(labPath);
    const baseSha256 = sha256(labBytes);
    if (baseSha256 !== policy.source_lab.sha256) throw new Error('Canonical LAB hash mismatch; original LAB was not changed');
    const lab = JSON.parse(labBytes.toString('utf8').replace(/^\uFEFF/, ''));
    if (lab.lab_version !== policy.source_lab.lab_version) throw new Error('Canonical LAB version mismatch');
    if (Object.prototype.hasOwnProperty.call(lab, 'rea_processing')) throw new Error('Base LAB already contains a REA extension');
    return { policy, lab, labPath, baseSha256, contractSha256: sha256(contractBytes) };
}

function buildArtifacts() {
    const input = readInputs();
    const provenance = {
        authority: input.policy.authority,
        source_lab_path: input.policy.source_lab.path,
        source_lab_sha256: input.baseSha256,
        processing_contract_path: 'contracts/rea/rea-processing-v1.json',
        processing_contract_sha256: input.contractSha256,
        source_profiles_unchanged: true,
        original_workbook_modified: false,
        exported_by_original_workbook: false,
        generated_by: 'tools/rea/build_processing_policy.js'
    };
    const overlay = {
        overlay_schema: 'ape_lab_additive_overlay_v1',
        base_lab: { path: input.policy.source_lab.path, sha256: input.baseSha256 },
        rea_processing: input.policy,
        rea_provenance: provenance
    };
    const derivedLab = Object.assign({}, input.lab, {
        rea_processing: input.policy,
        rea_provenance: provenance
    });
    const runtime = '/* Generated by tools/rea/build_processing_policy.js; edit the contract or factory, not this file.\n' +
        ' * contract_sha256=' + input.contractSha256 + '\n' +
        ' * Requested processing only; no physical HDR or playback result is certified here. */\n' +
        '(function (root) {\n    var api = (' + createRuntime.toString() + ')(' + JSON.stringify(input.policy, null, 2) + ');\n' +
        '    if (typeof module === "object" && module.exports) module.exports = api;\n' +
        '    if (root) root.APE_REA_POLICY = api;\n' +
        '})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));\n';
    return { input, runtime, overlay, derivedLab };
}

function writeAtomic(filename, content) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = filename + '.tmp-' + process.pid;
    try {
        fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporary, filename);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}

function main(argv) {
    const allowed = new Set(['--check', '--lab-output']);
    let check = false;
    let labOutput = null;
    for (let i = 0; i < argv.length; i++) {
        if (!allowed.has(argv[i])) throw new Error('Usage: build_processing_policy.js [--check] [--lab-output <path>]');
        if (argv[i] === '--check') check = true;
        else {
            if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--lab-output requires a path');
            labOutput = path.resolve(argv[++i]);
        }
    }
    const artifacts = buildArtifacts();
    const outputs = [[RUNTIME_PATH, artifacts.runtime], [OVERLAY_PATH, json(artifacts.overlay)]];
    if (labOutput) {
        if ([artifacts.input.labPath, CONTRACT_PATH, RUNTIME_PATH, OVERLAY_PATH].includes(labOutput)) {
            throw new Error('Derived LAB output must not overwrite a source or generated contract artifact');
        }
        outputs.push([labOutput, json(artifacts.derivedLab)]);
    }
    for (const [filename, content] of outputs) {
        if (check) {
            if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== content) {
                throw new Error('Generated artifact is stale: ' + path.relative(ROOT, filename));
            }
        } else writeAtomic(filename, content);
    }
    console.log(JSON.stringify({ mode: check ? 'check' : 'build', policy_id: artifacts.input.policy.policy_id,
        base_lab_sha256: artifacts.input.baseSha256, contract_sha256: artifacts.input.contractSha256,
        outputs: outputs.map(function (entry) { return path.relative(ROOT, entry[0]); }),
        source_profiles_unchanged: true, original_workbook_modified: false }));
}

module.exports = { createRuntime, buildArtifacts, readInputs, main, CONTRACT_PATH, RUNTIME_PATH, OVERLAY_PATH };
if (require.main === module) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
