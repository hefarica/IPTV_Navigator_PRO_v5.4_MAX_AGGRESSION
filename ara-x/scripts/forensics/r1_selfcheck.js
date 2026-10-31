#!/usr/bin/env node
'use strict';
/**
 * R1 · Autoverificación aritmética de R1_findings.json contra la evidencia cruda.
 * Falla (exit 1) si cualquier invariante no cuadra.
 *
 * Usage: node ara-x/scripts/forensics/r1_selfcheck.js
 */
const fs = require('node:fs');
const path = require('node:path');

const R = path.resolve(__dirname, '../../reports');
const F = JSON.parse(fs.readFileSync(path.join(R, 'R1_findings.json'), 'utf8'));
const A = JSON.parse(fs.readFileSync(path.join(R, 'r1_evidence/local_full.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(R, 'r1_evidence/cdn_full.json'), 'utf8'));
const PA = JSON.parse(fs.readFileSync(path.join(R, 'r1_evidence/probe_local.json'), 'utf8'));
const P2A = JSON.parse(fs.readFileSync(path.join(R, 'r1_evidence/probe2_local.json'), 'utf8'));
const CMP = JSON.parse(fs.readFileSync(path.join(R, 'r1_evidence/compare.json'), 'utf8'));

const checks = [];
const eq = (name, got, want) => checks.push({ name, got, want, ok: String(got) === String(want) });
const ok = (name, cond, detail) => checks.push({ name, got: detail, want: 'true', ok: !!cond });

const m = F.measurements;
const L = m.local, C = m.cdn, X = m.comparison;

// --- identidad de artefactos ---
eq('artifact A bytes', F.artifacts[0].bytes, A.bytes);
eq('artifact A sha256', F.artifacts[0].sha256.toLowerCase(), 'e27c03eb45dacd6e5f19c3f4e016b456236ca2c06f485ddf11165ddc86e2a680');
eq('artifact B bytes', F.artifacts[1].bytes, B.bytes);
eq('artifact B sha256', F.artifacts[1].sha256.toLowerCase(), '81dbdd11ec620b1dead702ca404c9959c61f301639a5d0091da37ebfb95be14e');
eq('A lines', F.artifacts[0].lines, A.lines);
eq('B lines', F.artifacts[1].lines, B.lines);
eq('A extinf', F.artifacts[0].extinf, A.tag_counts['#EXTINF']);
eq('B extinf', F.artifacts[1].extinf, B.tag_counts['#EXTINF']);
eq('A stream_inf', F.artifacts[0].stream_inf, A.tag_counts['#EXT-X-STREAM-INF']);
eq('B stream_inf', F.artifacts[1].stream_inf, B.tag_counts['#EXT-X-STREAM-INF']);
eq('A iframe', F.artifacts[0].iframe_stream_inf, A.tag_counts['#EXT-X-I-FRAME-STREAM-INF']);
eq('A distinct tags', F.artifacts[0].distinct_tag_names, Object.keys(A.tag_counts).length);
eq('B distinct tags', F.artifacts[1].distinct_tag_names, Object.keys(B.tag_counts).length);
eq('A header lines', F.artifacts[0].header_lines, A.header.lines);
eq('A empty lines', F.artifacts[0].blank_lines, A.empty_lines);

// --- perfiles ---
const profSum = Object.values(L.profile_distribution).reduce((a, b) => a + b, 0);
eq('profile sum A', profSum, L.channels);
eq('P1', L.profile_distribution.P1, 808);
eq('P3', L.profile_distribution.P3, 2300);
eq('P4', L.profile_distribution.P4, 7523);
eq('truthful_4k + declared_4k', L.truth_x_tab.truthful_4k_metadata + L.truth_x_tab.declared_4k_wire_only, L.channels);
ok('declared_4k_pct', Math.abs(L.truth_x_tab.declared_4k_wire_only_pct - 100 * 9823 / 10631) < 0.06, L.truth_x_tab.declared_4k_wire_only_pct);

// --- STREAM-INF ---
const bw = Object.values(L.stream_inf.bandwidth).reduce((a, b) => a + b, 0);
eq('A bandwidth sum', bw, L.stream_inf.resolution['3840x2160']);
eq('A bw 9M', L.stream_inf.bandwidth['9000000'], 8021);
eq('A bw 12M', L.stream_inf.bandwidth['12000000'], 1757);
eq('A bw 28M', L.stream_inf.bandwidth['28000000'], 853);
eq('B bw sum', Object.values(C.stream_inf_declarations.bandwidth).reduce((a, b) => a + b, 0), C.stream_inf);
eq('B stream_inf + no_variant', C.stream_inf + C.channels_without_stream_inf, C.channels);
eq('B channels_without', C.channels_without_stream_inf, 45);
eq('B ids length', C.channels_without_stream_inf_ids.length, 45);
eq('A hdcp', L.stream_inf.hdcp_level_type1, 10586);
eq('A cp/tr', L.stream_inf.color_primaries_9, 10586);
eq('A supplemental', L.stream_inf.supplemental_codecs, 0);

// --- tags APE ---
eq('4kfalse', L.apes_tags['4kfalse_lines'], 4 * L.channels);
eq('8kfake A', L.apes_tags['8kfake_lines'], L.channels);
eq('8kfake B', C.apes_tags['8kfake_lines'], 808);
eq('4kpremium B', C.apes_tags['4k_premium_lines'], 808);
eq('4kfalse B', C.apes_tags['4kfalse_lines'], 4 * C.channels);

// --- EXTINF / codecs ---
eq('codec_family sum A', Object.values(L.extinf.codec_family).reduce((a, b) => a + b, 0), L.channels);
eq('h264', L.extinf.codec_family.h264, 9593);
eq('hevc', L.extinf.codec_family.hevc, 1038);
eq('ape_fps sum', Object.values(L.extinf.ape_fps).reduce((a, b) => a + b, 0), L.channels);
eq('catchup', L.extinf.catchup_channels, 355);
eq('empty logo', L.extinf.empty_tvg_logo, 319);
eq('profile_x sum', Object.values(L.truth_x_tab.profile_x_x_resolution).reduce((a, b) => a + b, 0), L.channels);

// --- EXTHTTP ---
eq('exthttp count', L.ext_http.count, L.channels);
eq('exthttp valid', L.ext_http.json_valid, L.channels);
eq('exthttp invalid', L.ext_http.json_invalid, 0);
eq('exthttp header dist sum', Object.values(L.ext_http.header_count_distribution).reduce((a, b) => a + b, 0), L.channels);
eq('exthttp distinct names', L.ext_http.distinct_header_names, A.ext_http.key_presence.total_distinct);

// --- URLs / duplicados ---
eq('urls', L.urls.count, L.channels);
eq('urls distinct', L.urls.distinct_exact, L.channels);
eq('url dups', L.duplicates.url_exact, 0);
eq('tvgid dups', L.duplicates.tvg_id, 0);
eq('name dups', L.duplicates.tvg_name, 108);
eq('name unique + dups', 10631 - 108, 10523);
eq('url_bytes', L.url_bytes_total, A.bytes - Object.values(A.tag_bytes).reduce((a, b) => a + b, 0) - A.empty_lines);
eq('url_bytes B', C.url_bytes_total, B.bytes - Object.values(B.tag_bytes).reduce((a, b) => a + b, 0) - B.empty_lines);
eq('metadata share', L.metadata_share_pct, Number((100 * Object.values(A.tag_bytes).reduce((a, b) => a + b, 0) / A.bytes).toFixed(2)));
eq('metadata share B', C.metadata_share_pct, Number((100 * Object.values(B.tag_bytes).reduce((a, b) => a + b, 0) / B.bytes).toFixed(2)));

// --- unicidad ---
eq('daterange A', L.uniqueness.daterange_ids, A.tag_counts['#EXT-X-DATERANGE']);
eq('daterange distinct', L.uniqueness.daterange_distinct, 10632);
eq('sid total', L.uniqueness.sid_total, L.channels);
eq('sid distinct', L.uniqueness.sid_distinct, 10630);
eq('spoof ips', L.uniqueness.spoof_ip_distinct, A.session_ids.distinct_spoof_ip);

// --- LL-HLS / CMAF ---
eq('llhls parts', L.llhls.ext_x_part, 0);
eq('llhls part_inf', L.llhls.part_inf, 1);
eq('llhls server_control', L.llhls.server_control, 1);
eq('llhls targetduration', L.llhls.targetduration, 1);
eq('cmaf map', L.cmaf.ext_x_map, 0);
eq('cmaf key', L.cmaf.ext_x_key, 0);
eq('cmaf lines', L.cmaf.ext_x_cmaf_lines, L.channels);
eq('iframe uri', P2A.iframe.with_uri, 0);
eq('iframe count', P2A.iframe.count, 10631);
eq('iframe resolution', P2A.iframe.with_resolution, 0);
eq('wire 7680 A', L.wire_7680_occurrences, P2A.count_8k_strings.any_7680);
eq('wire 7680 B', C.wire_7680_occurrences, 0);
eq('ara tags A', L.ara_tags, PA.ara_tags);
eq('ara tags B', C.ara_tags, 0);

// --- comparación A/B ---
eq('file byte delta', A.bytes - B.bytes, X.byte_delta);
eq('byte accounted sum', X.byte_delta_accounted.sum, X.byte_delta);
eq('byte accounted match', X.byte_delta_accounted.match, true);
eq('file line delta', B.lines - A.lines, X.line_delta_accounted.sum);
eq('line accounted sum', X.line_delta_accounted.sum, B.lines - A.lines);
eq('line accounted match', X.line_delta_accounted.match, true);
eq('shared urls', X.shared_urls, 10631);
eq('urls only A', X.urls_only_in_A, CMP.url_set.only_left);
eq('urls only B', X.urls_only_in_B, CMP.url_set.only_right);
eq('shared ids', X.shared_tvg_ids, CMP.id_set.shared);
eq('id only A', X.tvg_ids_only_in_A, CMP.id_set.only_left);
eq('id only B', X.tvg_ids_only_in_B, CMP.id_set.only_right);
eq('same url hash at index', X.identical_at_same_index.url_hash, CMP.fields.url.same_at_same_index);
eq('same profile at index', X.identical_at_same_index.ape_profile, CMP.fields.profile.same_at_same_index);
eq('same xres at index', X.identical_at_same_index.x_resolution, CMP.fields.xres.same_at_same_index);
eq('stream_inf mismatch at index', X.differing_at_same_index.stream_inf, CMP.fields.si.mismatched_at_index);
eq('8kfake mismatch at index', X.differing_at_same_index['8kfake'], CMP.fields.sf.mismatched_at_index);
eq('line mismatch at index', X.differing_at_same_index.block_lines, CMP.fields.lines.mismatched_at_index);
eq('header diff lines', X.header_line_differences, 3);
eq('polymorphic tags', X.polymorphic_tags_rotated, 30);

// --- findings ---
eq('findings count', F.findings.length, 20);
eq('unique finding ids', new Set(F.findings.map((f) => f.id)).size, F.findings.length);
ok('severities valid', F.findings.every((f) => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(f.severity)), 'all have severity');
ok('no credential literals', !/\/live\/[A-Za-z0-9]{4,}\/[A-Za-z0-9]{4,}\/[0-9]+\.m3u8/.test(JSON.stringify(F)), 'no /live/<user>/<pass>/<id> literal');

const failed = checks.filter((c) => !c.ok);
for (const c of checks) if (!c.ok) console.log(`FAIL ${c.name}: got=${c.got} want=${c.want}`);
console.log(`checks=${checks.length} pass=${checks.length - failed.length} fail=${failed.length}`);
console.log(failed.length === 0 ? 'ALL_OK' : 'NOT_OK');
process.exit(failed.length === 0 ? 0 : 1);
