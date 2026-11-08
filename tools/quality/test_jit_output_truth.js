#!/usr/bin/env node
'use strict';
/** Real FFmpeg/ffprobe fixtures. No provider, VPS, test doubles or device claims. */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const jit = require('../lab/ape-jit/server.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-jit-output-truth-'));
let assertions = 0;
const cases = [];
function equal(actual, expected) { assert.deepEqual(actual, expected); assertions++; }
function ok(value) { assert.ok(value); assertions++; }
function rejects(fn, pattern) { assert.throws(fn, pattern); assertions++; }
function ffmpeg(args, cwd) {
  return execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args],
    { cwd: cwd || work, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function probe(file) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file],
    { encoding: 'utf8', timeout: 10000 }));
}
function source(file) {
  const streams = probe(file).streams, video = streams.find(s => s.codec_type === 'video');
  const audio = streams.find(s => s.codec_type === 'audio');
  return { width: video.width, height: video.height, codec: video.codec_name,
    transfer: video.color_transfer || '', primaries: video.color_primaries || '',
    matrix: video.color_space || '', range: video.color_range || '',
    audioOk: !!(audio && audio.channels > 0 && Number(audio.sample_rate) > 0), audioCodec: audio && audio.codec_name || '' };
}
function fixture(name, codec, width, height, transfer, audioCodec = 'aac') {
  const file = path.join(work, name + '.mp4');
  const hdr = transfer !== 'bt709';
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=gray:s=' + width + 'x' + height + ':r=50',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=5.1', '-t', '0.12', '-map', '0:v', '-map', '1:a',
    '-c:v', codec === 'hevc' ? 'libx265' : 'libx264', '-preset', 'ultrafast',
    '-threads', '2', '-filter_threads', '1', '-pix_fmt', hdr ? 'yuv420p10le' : 'yuv420p',
    '-color_primaries', hdr ? 'bt2020' : 'bt709', '-color_trc', transfer,
    '-colorspace', hdr ? 'bt2020nc' : 'bt709', '-color_range', 'tv',
    ...(codec === 'hevc' ? ['-x265-params', 'pools=1:frame-threads=1:log-level=error', '-tag:v', 'hvc1'] : []),
    '-c:a', audioCodec, '-b:a', '384k', file]);
  return file;
}
function mux(file, plan, name) {
  const dir = path.join(work, name); fs.mkdirSync(dir);
  ffmpeg(['-filter_threads', '1', '-i', file, '-map', '0:v:0', '-map', '0:a:0?',
    ...plan.videoArgs, ...plan.audioArgs, '-f', 'dash', '-seg_duration', '1', '-frag_duration', '1',
    '-hls_playlist', '1', '-hls_master_name', 'master.m3u8', '-init_seg_name', 'init-fixture-$RepresentationID$.m4s',
    '-media_seg_name', 'chunk-fixture-$RepresentationID$-$Number$.m4s', 'manifest.mpd'], dir);
  return dir;
}
function joined(dir, representation) {
  const names = fs.readdirSync(dir).filter(n => n.startsWith('chunk-fixture-' + representation + '-')).sort();
  const target = path.join(dir, 'joined-' + representation + '.mp4');
  fs.writeFileSync(target, Buffer.concat([fs.readFileSync(path.join(dir, 'init-fixture-' + representation + '.m4s')),
    ...names.map(n => fs.readFileSync(path.join(dir, n)))]));
  return target;
}
function packetHashes(file, selector) {
  const data = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', selector,
    '-show_packets', '-show_entries', 'packet=data_hash', '-show_data_hash', 'sha256', '-of', 'json', file],
    { encoding: 'utf8', timeout: 10000 }));
  return data.packets.map(p => p.data_hash);
}
async function runCase(name, file, options, expected) {
  const src = source(file), plan = jit.buildEncodingPlan(src, { env: {}, ...options });
  equal(plan.copyNative, expected.copy);
  equal(plan.videoArgs.includes('-ac'), false);
  equal(plan.audioArgs, ['-c:a', 'copy']);
  ok(!plan.videoArgs.join(' ').includes('fps='));
  ok(!plan.videoArgs.join(' ').includes('setparams='));
  const dir = mux(file, plan, name);
  const state = { ...plan, id: name, session: 'fixture', dir, started: 0,
    sourceWidth: src.width, sourceHeight: src.height, outputTruth: null };
  const truth = await jit.ensureOutputTruth(state);
  ok(truth);
  equal(truth.width, plan.width); equal(truth.height, plan.height);
  equal(truth.videoRange, expected.range); equal(truth.codec, expected.codec);
  const before = fs.readFileSync(path.join(dir, 'master.m3u8'), 'utf8');
  const master = jit.hdrMaster(before, state);
  const variant = before.split('\n').find(l => l.startsWith('#EXT-X-STREAM-INF:'));
  const newVariant = master.split('\n').find(l => l.startsWith('#EXT-X-STREAM-INF:'));
  equal(newVariant.replace(/,VIDEO-RANGE=(SDR|PQ|HLG)/g, ''), variant);
  ok(newVariant.includes('VIDEO-RANGE=' + expected.range));
  equal((newVariant.match(/VIDEO-RANGE=/g) || []).length, 1);
  equal(jit.hdrMaster(master, state), master);
  const mpdBefore = fs.readFileSync(path.join(dir, 'manifest.mpd'), 'utf8');
  const mpd = jit.hdrMpd(mpdBefore, state);
  equal(mpd.match(/\bcodecs="[^"]+"/g), mpdBefore.match(/\bcodecs="[^"]+"/g));
  ok(mpd.includes('cicp:TransferCharacteristics" value="' + ({ SDR: 1, PQ: 16, HLG: 18 }[expected.range]) + '"'));
  ok(mpd.includes('urn:ape:processing:domain" value="vps_jit_legacy"'));
  const desc = jit.outputDescriptor(state);
  equal(desc.video_range, expected.range); equal(desc.master_display, null);
  equal(desc.max_cll, null); equal(desc.max_fall, null);
  equal(desc.average_bandwidth, null);
  const json = jit.manifestJson({ headers: { host: 'fixture.invalid' } }, name, false, false, state);
  equal(json.rea_executed, false); equal(json.processing_domain, 'vps_jit_legacy');
  equal(json.streams[0].video_range, expected.range);
  const inactive = jit.manifestJson({ headers: { host: 'fixture.invalid' } }, 'another', false, false, state);
  equal(inactive.streams, []); equal(inactive.crystal_uhd.output_resolution, null);
  const videoFile = joined(dir, '0'), audioFile = joined(dir, '1');
  const outVideo = probe(videoFile).streams[0], outAudio = probe(audioFile).streams[0];
  equal(outVideo.avg_frame_rate, '50/1');
  equal(outAudio.channels, 6); equal(outAudio.codec_name, src.audioCodec);
  equal(packetHashes(audioFile, 'a:0'), packetHashes(file, 'a:0'));
  if (expected.copy) equal(packetHashes(videoFile, 'v:0'), packetHashes(file, 'v:0'));
  cases.push({ name, source: src.width + 'x' + src.height, sourceCodec: src.codec,
    output: desc.resolution, outputCodec: truth.codec, videoRange: truth.videoRange,
    videoCopied: plan.copyNative, audioCodec: outAudio.codec_name, audioChannels: outAudio.channels,
    frameRate: outVideo.avg_frame_rate, code: 'PASS' });
  return { src, plan, state };
}

async function main() {
  const h264Sdr = fixture('h264-sdr', 'h264', 3840, 2160, 'bt709');
  const h264Pq = fixture('h264-pq', 'h264', 3840, 2160, 'smpte2084');
  const hevcPq = fixture('hevc-pq', 'hevc', 3840, 2160, 'smpte2084', 'eac3');
  const hevcHlg = fixture('hevc-hlg', 'hevc', 3840, 2160, 'arib-std-b67', 'ac3');
  const sdrSmall = fixture('sdr-small', 'h264', 640, 360, 'bt709');
  const hlgSmall = fixture('hlg-small', 'hevc', 1280, 720, 'arib-std-b67');
  const sdr = await runCase('sdr4k-copy', h264Sdr, {}, { copy: true, range: 'SDR', codec: 'h264' });
  await runCase('h264-pq-copy', h264Pq, {}, { copy: true, range: 'PQ', codec: 'h264' });
  await runCase('hevc-pq-copy', hevcPq, { env: { APE_SCHEME: 'av1' } }, { copy: true, range: 'PQ', codec: 'hevc' });
  const hlg = await runCase('hevc-hlg-copy', hevcHlg, {}, { copy: true, range: 'HLG', codec: 'hevc' });
  await runCase('sdr-to-pq', sdrSmall, {}, { copy: false, range: 'PQ', codec: 'hevc' });
  await runCase('small-hlg-native', hlgSmall, {}, { copy: true, range: 'HLG', codec: 'hevc' });

  // Decision boundaries use the same production planner with the measured source.
  rejects(() => jit.buildEncodingPlan(hlg.src, { env: {}, sdr: true }), /SOURCE_PRESERVATION_REQUIRED/);
  rejects(() => jit.buildEncodingPlan(sdr.src, { env: {}, sdr720: true }), /SOURCE_PRESERVATION_REQUIRED/);
  rejects(() => jit.buildEncodingPlan({ ...sdr.src, audioCodec: 'dts' }, { env: {} }), /UNSUPPORTED_CMAF_AUDIO/);
  rejects(() => jit.buildEncodingPlan({ ...sdr.src, audioOk: false }, { env: {} }), /AUDIO_PROBE_INCOMPLETE/);
  const noAudio = jit.buildEncodingPlan({ ...sdr.src, audioOk: false, audioCodec: '' }, { env: {} });
  equal(noAudio.audioArgs, ['-an']);
  const unknown = jit.buildEncodingPlan({ ...sdr.src, width: 640, height: 360, transfer: '', primaries: '' }, { env: {} });
  equal(unknown.copyNative, true); equal(unknown.outputColorIntent.transfer, '');
  const six = jit.buildEncodingPlan(hlg.src, { env: { APE_SCHEME: 'av1', APE_6K: '1' } });
  equal(six.sixK, true); equal(six.width, 6144); equal(six.height, 3456);
  equal(six.outputColorIntent.transfer, 'arib-std-b67');
  ok(!six.videoArgs.join(' ').includes('smpte2084'));
  ok(!six.videoArgs.join(' ').includes('fps='));
  const eight = jit.buildEncodingPlan({ ...hlg.src, width: 7680, height: 4320 }, { env: { APE_SCHEME: 'av1', APE_6K: '1' } });
  equal(eight.copyNative, true); equal(eight.width, 7680); equal(eight.sixK, false);
  const noTruth = { ...hlg.state, outputTruth: null };
  equal(jit.outputDescriptor(noTruth), null);
  ok(!jit.hdrMaster('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=123,CODECS="avc1.42c01e"\na.m3u8\n', noTruth).includes('VIDEO-RANGE='));
  equal(jit.safeStartFailure(new Error('UNSUPPORTED_CMAF_AUDIO: details')), 'UNSUPPORTED_CMAF_AUDIO');
  equal(jit.safeStartFailure(new Error('ffmpeg failed https://private.invalid/token=fixture')), 'JIT_START_FAILED');
  equal(jit.redactUpstreamUrls('Error opening https://user:fixture@private.invalid/live/p?token=fixture'), 'Error opening [upstream-url]');
  equal(jit.redactUpstreamUrls('HTTP 403; retry input'), 'HTTP 403; retry input');
  const ffmpegVersion = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
  const result = { ok: true, assertions, cases, ffmpegVersion,
    scope: 'Real synthetic FFmpeg source files and production encoding plan/mux/output-init functions; source video and audio packet preservation checked',
    sixK: 'planner and transfer-preservation gates verified; full 6K encoding performance not certified',
    productionVpsTested: false, physicalHdrTested: false, devicePlaybackTested: false };
  if (process.argv.includes('--report')) {
    const target = process.argv[process.argv.indexOf('--report') + 1];
    if (!target) throw new Error('--report requires an output path');
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); if (error.stderr) console.error(String(error.stderr).slice(-2500)); process.exitCode = 1; })
  .finally(() => fs.rmSync(work, { recursive: true, force: true }));
