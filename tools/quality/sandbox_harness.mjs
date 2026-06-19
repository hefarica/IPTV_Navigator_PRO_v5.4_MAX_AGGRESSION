// ============================================================================
// APE Visual Extreme — Science-Safe sandbox harness (Node)
// luac/OpenResty are unavailable locally (LUAC_UNAVAILABLE), so this Node port
// validates the DECISION LOGIC of the Science-Safe Lua: profile resolution
// priority, variant ordering (resolution-dominant), and AVC-fallback preservation.
// The actual ngx/OpenResty integration remains UNVERIFIED until a VPS `resty` run.
// Exit: 0 all pass, 1 any fail.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const TD = path.join(HERE, 'testdata');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`);
  ok ? pass++ : fail++;
}

// ---- port of profile resolution (header -> arg -> stream_id map -> devstate -> P2) ----
const safeUpper = x => { x = String(x ?? '').toUpperCase(); return /^P[0-5]$/.test(x) ? x : null; };
function extractStreamId(uri) {
  const u = String(uri ?? '');
  const m = u.match(/\/live\/[^/]+\/[^/]+\/([^/.?]+)\.m3u8/) ||
            u.match(/\/live\/[^/]+\/[^/]+\/([^/?]+)/) ||
            u.match(/\/([^/?]+)\.m3u8$/);
  return m ? m[1].replace(/[^0-9A-Za-z_.-]/g, '') : null;
}
function profileFromMap(sid, mapTxt) {
  if (!sid || !mapTxt || mapTxt.length < 2) return null;
  let obj; try { obj = JSON.parse(mapTxt); } catch { return null; }
  if (typeof obj !== 'object' || !obj) return null;
  if (typeof obj[sid] === 'string') return safeUpper(obj[sid]);
  if (obj.streams && typeof obj.streams[sid] === 'string') return safeUpper(obj.streams[sid]);
  if (obj.streams && obj.streams[sid] && typeof obj.streams[sid] === 'object') return safeUpper(obj.streams[sid].profile);
  return null;
}
function profileFromDevstate(devTxt) {
  if (!devTxt) return null;
  let obj; try { obj = JSON.parse(devTxt); } catch { return null; }
  if (typeof obj !== 'object' || !obj) return null;
  return safeUpper(obj.profile ?? obj.visual_profile ?? obj.ape_profile);
}
function resolveProfile(ctx) {
  let p = safeUpper(ctx.header) ?? safeUpper(ctx.arg);
  if (p) return [p, 'header_or_arg'];
  const sid = extractStreamId(ctx.uri);
  if (sid) { const pj = profileFromMap(sid, ctx.mapTxt); if (pj) return [pj, 'stream_id_map']; }
  const pd = profileFromDevstate(ctx.devTxt); if (pd) return [pd, 'devstate'];
  return ['P2', 'default'];
}

// ---- port of variant scoring/ordering (science-safe body filter) ----
function codecRank(c) {
  c = String(c || '').toLowerCase();
  if (c.includes('dvh1') || c.includes('dvhe')) return 115;
  if (c.includes('hvc1.2')) return 110;
  if (c.includes('hvc1')) return 100;
  if (c.includes('av01')) return 95;
  if (c.includes('vp09')) return 70;
  if (c.includes('avc1.64')) return 45;
  if (c.includes('avc1') || c.includes('avc3')) return 35;
  return 50;
}
function resScore(w, h) {
  const px = w * h;
  if (px >= 7680 * 4320) return 80;
  if (px >= 3840 * 2160) return 60;
  if (px >= 2560 * 1440) return 40;
  if (px >= 1920 * 1080) return 25;
  if (px >= 1280 * 720) return 10;
  return 0;
}
function parseMaster(txt) {
  const lines = txt.split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/#EXT-X-STREAM-INF/.test(lines[i])) continue;
    const inf = lines[i];
    let url = '';
    if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) { url = lines[i + 1]; i++; }
    const bw = +(inf.match(/BANDWIDTH=(\d+)/)?.[1] || 0);
    const abw = +(inf.match(/AVERAGE-BANDWIDTH=(\d+)/)?.[1] || bw);
    const codecs = inf.match(/CODECS="([^"]+)"/)?.[1] || '';
    const res = inf.match(/RESOLUTION=(\d+x\d+)/)?.[1] || '';
    const fps = +(inf.match(/FRAME-RATE=([\d.]+)/)?.[1] || 0);
    const [w, h] = res ? res.split('x').map(Number) : [0, 0];
    variants.push({ inf, url, bw, abw, codecs, res, fps, w, h, crank: codecRank(codecs), rscore: resScore(w, h) });
  }
  return variants;
}
function scienceOrder(variants, profile) {
  const pw = ({ P0: 1.20, P1: 1.15, P2: 1.08, P3: 1.00, P4: 0.92, P5: 0.85 })[profile] || 1.0;
  for (const v of variants) {
    const bpp = (v.abw > 0 && v.w > 0 && v.h > 0) ? v.abw / (v.w * v.h * (v.fps || 30)) : 0;
    const bppScore = Math.min(bpp * 10000, 120);
    const fpsScore = v.fps >= 59 ? 12 : (v.fps >= 49 ? 10 : (v.fps >= 29 ? 5 : 0));
    const hdr = /VIDEO-RANGE=PQ|HDR=/.test(v.inf) ? 8 : 0;
    v.score = (v.rscore * 100 + v.crank * 12 + bppScore + fpsScore + hdr) * pw;
  }
  // SAFE mode: preserve ALL variants, just reorder (no deletion).
  return [...variants].sort((a, b) => b.score - a.score || b.abw - a.abw);
}

console.log('=== FASE 4: profile resolution (6 cases) ===');
const mapTxt = JSON.stringify({ streams: { '777': { profile: 'P3' } } });
check('case1 header P4 wins', resolveProfile({ header: 'p4', uri: '/live/u/p/777.m3u8', mapTxt })[0] === 'P4');
check('case2 stream_id map -> P3', (() => { const [p, s] = resolveProfile({ uri: '/live/u/p/777.m3u8', mapTxt }); return p === 'P3' && s === 'stream_id_map'; })());
check('case3 devstate -> P3', (() => { const [p, s] = resolveProfile({ uri: '/foo/bar', devTxt: JSON.stringify({ profile: 'P3' }) }); return p === 'P3' && s === 'devstate'; })());
check('case4 nothing -> P2 default', resolveProfile({ uri: '/x.m3u8' })[0] === 'P2');
check('case5 corrupt JSON -> P2 (no crash)', resolveProfile({ uri: '/live/u/p/777.m3u8', mapTxt: '{bad json' })[0] === 'P2');
check('case6 non-live URI -> P2 (no crash)', resolveProfile({ uri: '/foo/bar.html' })[0] === 'P2');
check('case7 invalid profile token -> ignored, falls to P2', resolveProfile({ header: 'P9', uri: '/x' })[0] === 'P2');

console.log('\n=== FASE 6: HLS mutation policy (AVC preserved, resolution-dominant) ===');
const master = fs.readFileSync(path.join(TD, 'master_sample.m3u8'), 'utf8');
const vIn = parseMaster(master);
const vOut = scienceOrder(vIn, 'P2');
const avcIn = vIn.filter(v => /avc1/i.test(v.codecs)).length;
const avcOut = vOut.filter(v => /avc1/i.test(v.codecs)).length;
check('all variants preserved (no deletion)', vOut.length === vIn.length, `in=${vIn.length} out=${vOut.length}`);
check('AVC fallback preserved', avcOut === avcIn && avcOut >= 1, `avc in=${avcIn} out=${avcOut}`);
check('top variant is the 4K HEVC (resolution-dominant)', vOut[0].w === 3840 && /hvc1/i.test(vOut[0].codecs), `top=${vOut[0].res}/${vOut[0].codecs}`);

// resolution-dominance: a 1080p Dolby Vision must NOT outrank a 4K HEVC Main10
const dvVs4k = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=8500000,RESOLUTION=1920x1080,FRAME-RATE=60,CODECS="dvh1.05.06,mp4a.40.2"
1080p_dv.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=13000000,AVERAGE-BANDWIDTH=12000000,RESOLUTION=3840x2160,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
4k_hevc.m3u8`;
const vo2 = scienceOrder(parseMaster(dvVs4k), 'P2');
check('4K Main10 outranks 1080p Dolby Vision (no 4K->1080p downgrade)', vo2[0].w === 3840, `top=${vo2[0].res}/${vo2[0].codecs}`);

console.log(`\nRESULT: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
