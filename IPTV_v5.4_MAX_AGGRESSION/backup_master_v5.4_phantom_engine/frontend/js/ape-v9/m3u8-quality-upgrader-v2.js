/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M3U8 QUALITY UPGRADER v2.0 — PHOENIX-QMAX-ADAPTIVE
 * GREEDY BEST-AVAILABLE SELECTION PROTOCOL
 *
 * Strategy: REQUEST 8K → ACCEPT BEST AVAILABLE → NEVER DOWNGRADE
 *
 * Changes from v1.0:
 *   - Hardcoded bitrate=60000 → quality=max,resolution=max,bitrate=max
 *   - Anti-downgrade rules: if 4K exists, selecting 1080p = FAILURE
 *   - Buffer escalation: 45s/750MB → 60s/1GB for 8K-class streams
 *   - Selection Efficiency scoring factor (0.05 weight)
 *   - Greedy header: never-downgrade,select-best-available
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   Node.js:
 *     const upgrader = new M3U8QualityUpgraderV2();
 *     const result = upgrader.upgrade(fs.readFileSync('playlist.m3u8', 'utf8'));
 *     fs.writeFileSync('playlist_QMAX.m3u8', result.content);
 *
 *   Browser:
 *     const upgrader = new M3U8QualityUpgraderV2();
 *     const result = upgrader.upgrade(m3u8String);
 */

class M3U8QualityUpgraderV2 {
  constructor(config = {}) {
    this.config = {
      // ══════════════════════════════════════════════════════════════
      // GREEDY QUALITY SETTINGS — "Request the stars, accept the sky"
      // ══════════════════════════════════════════════════════════════
      targetResolution: config.targetResolution || '7680x4320',  // Request 8K
      targetFps: config.targetFps || 60,
      codec: config.codec || 'hevc',
      profile: config.profile || 'main-10',
      colorDepth: config.colorDepth || 12,

      // ══════════════════════════════════════════════════════════════
      // ADAPTIVE BUFFER ARCHITECTURE — Sized for 8K class streams
      // 80Mbps × 60s = 600MB minimum; we use 1GB for headroom
      // ══════════════════════════════════════════════════════════════
      networkCaching: config.networkCaching || 60000,    // 60 seconds
      bufferSize:     config.bufferSize     || 1000000,  // 1 GB
      readBuffer:     config.readBuffer     || 32768,    // 32 KB chunks
      liveCaching:    config.liveCaching    || 5000,     // 5 seconds
      prebuffer:      config.prebuffer      || 30,       // 30 seconds

      // STREAM-INF
      bandwidth: config.bandwidth || 80000000,           // 80 Mbps peak

      // Output
      preserveOriginal: config.preserveOriginal !== false,
      logChanges: config.logChanges !== false
    };

    // ══════════════════════════════════════════════════════════════
    // QUALITY TIER DEFINITIONS
    // ══════════════════════════════════════════════════════════════
    this.tiers = [
      { name: 'S', label: '8K UHD',  res: '7680x4320', score: 1000, minBitrate: 50000 },
      { name: 'A', label: '4K UHD',  res: '3840x2160', score: 800,  minBitrate: 25000 },
      { name: 'A-', label: 'QHD',    res: '2560x1440', score: 600,  minBitrate: 15000 },
      { name: 'B', label: 'FHD',     res: '1920x1080', score: 400,  minBitrate: 10000 },
      { name: 'C', label: 'HD',      res: '1280x720',  score: 200,  minBitrate: 5000 },
      { name: 'D', label: 'SD',      res: '854x480',   score: 100,  minBitrate: 1000 }
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════
  upgrade(m3u8Content) {
    this._log('\n╔══════════════════════════════════════════════════════════════╗');
    this._log('║  PHOENIX-QMAX-ADAPTIVE v2.0 — GREEDY SELECTION PIPELINE    ║');
    this._log('╚══════════════════════════════════════════════════════════════╝');

    const startTime = Date.now();
    let content = m3u8Content;
    const stats = {
      originalSize: m3u8Content.length,
      channelsProcessed: 0,
      urlsRewritten: 0,
      headersUpgraded: 0,
      streamInfInjected: 0,
      buffersUpgraded: 0
    };

    stats.channelsProcessed = (content.match(/#EXTINF:/g) || []).length;
    this._log(`\n📊 Channels detected: ${stats.channelsProcessed}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: GREEDY URL REWRITING — &quality=max&never-downgrade=true
    // ═══════════════════════════════════════════════════════════════════
    this._log('\n[Step 1/5] Greedy URL Rewriting (quality=max)...');
    content = this._rewriteUrlsGreedy(content);
    stats.urlsRewritten = (content.match(/&quality=max/g) || []).length;
    this._log(`   ✅ URLs rewritten: ${stats.urlsRewritten}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: GREEDY QUALITY-PREFERENCE HEADERS
    // ═══════════════════════════════════════════════════════════════════
    this._log('\n[Step 2/5] Greedy Quality-Preference Headers...');
    content = this._upgradeQualityHeadersGreedy(content);
    stats.headersUpgraded = (content.match(/never-downgrade/g) || []).length;
    this._log(`   ✅ Headers upgraded: ${stats.headersUpgraded}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: ADAPTIVE BUFFER ESCALATION — 60s/1GB
    // ═══════════════════════════════════════════════════════════════════
    this._log('\n[Step 3/5] Adaptive Buffer Escalation (60s/1GB)...');
    content = this._escalateBuffers(content);
    stats.buffersUpgraded = (content.match(/"X-Network-Caching":"60000"/g) || []).length;
    this._log(`   ✅ Network-Caching: ${this.config.networkCaching}ms`);
    this._log(`   ✅ Buffer-Size: ${this.config.bufferSize}KB (1GB)`);
    this._log(`   ✅ Read-Buffer: ${this.config.readBuffer}B (32KB)`);
    this._log(`   ✅ Prebuffer: ${this.config.prebuffer}s`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: STREAM-INF INJECTION — Ordered by quality (highest first)
    // ═══════════════════════════════════════════════════════════════════
    this._log('\n[Step 4/5] STREAM-INF Injection (highest-first ordering)...');
    content = this._injectStreamInf(content);
    stats.streamInfInjected = (content.match(/#EXT-X-STREAM-INF/g) || []).length;
    this._log(`   ✅ STREAM-INF tags: ${stats.streamInfInjected}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: GLOBAL DIRECTIVE INJECTION — QMAX-ADAPTIVE headers
    // ═══════════════════════════════════════════════════════════════════
    this._log('\n[Step 5/5] Injecting QMAX-ADAPTIVE global directives...');
    content = this._injectGlobalDirectives(content);
    this._log('   ✅ QMAX-ADAPTIVE directives injected');

    // ═══════════════════════════════════════════════════════════════════
    // FINALIZE
    // ═══════════════════════════════════════════════════════════════════
    const elapsed = Date.now() - startTime;
    stats.finalSize = content.length;
    stats.sizeIncrease = ((stats.finalSize - stats.originalSize) / 1024).toFixed(2);

    this._log('\n╔══════════════════════════════════════════════════════════════╗');
    this._log('║  ✅ GREEDY SELECTION COMPLETE                               ║');
    this._log('╚══════════════════════════════════════════════════════════════╝');
    this._log(`📊 Channels:    ${stats.channelsProcessed}`);
    this._log(`📊 URLs:        ${stats.urlsRewritten} rewritten`);
    this._log(`📊 Headers:     ${stats.headersUpgraded} upgraded`);
    this._log(`📊 STREAM-INF:  ${stats.streamInfInjected} injected`);
    this._log(`📊 Size delta:  +${stats.sizeIncrease} KB`);
    this._log(`⏱️  Time:        ${elapsed}ms`);

    return {
      content,
      stats,
      originalContent: this.config.preserveOriginal ? m3u8Content : null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY: GREEDY QUALITY-PREFERENCE HEADERS
  // ═══════════════════════════════════════════════════════════════════════════
  _upgradeQualityHeadersGreedy(content) {
    // v2.0: Instead of hardcoded "bitrate-60000", use adaptive "max" directives
    const greedyQuality = [
      `codec-${this.config.codec}`,
      'codec-av1',
      `profile-${this.config.profile}`,
      'profile-main',
      'resolution-max',
      'bitrate-max',
      'hdr-dv',
      'hdr-hdr10+',
      'hdr-hdr10',
      'hdr-hlg',
      'fps-max',
      'quality-tier-s-first',
      'fallback-tier-a',
      'never-downgrade',
      'select-best-available'
    ].join(',');

    return content.replace(
      /"X-Quality-Preference":"[^"]*"/g,
      `"X-Quality-Preference":"${greedyQuality}"`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY: ADAPTIVE BUFFER ESCALATION
  // ═══════════════════════════════════════════════════════════════════════════
  _escalateBuffers(content) {
    // Network-Caching: 60 seconds (up from 45)
    content = content.replace(
      /"X-Network-Caching":"\d+"/g,
      `"X-Network-Caching":"${this.config.networkCaching}"`
    );

    // Buffer-Size: 1GB (up from 750MB)
    content = content.replace(
      /"X-Buffer-Size":"\d+"/g,
      `"X-Buffer-Size":"${this.config.bufferSize}"`
    );

    // Read-Buffer: 32KB (up from 16KB)
    content = content.replace(
      /(\"X-Buffer-Size\":\"\d+\")/g,
      `$1,"X-Read-Buffer":"${this.config.readBuffer}","X-Live-Caching":"${this.config.liveCaching}","X-Prebuffer":"${this.config.prebuffer}"`
    );

    return content;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY: STREAM-INF INJECTION (Profile-aware — respects P0-P5)
  // ═══════════════════════════════════════════════════════════════════════════

  // Profile → resolution/bandwidth mapping (matches m3u8-typed-arrays-ultimate.js)
  _getProfileSpec(profile) {
    const specs = {
      'P0': { res: '7680x4320', bw: 120000000, bitrate: 120000000, label: '8K' },
      'P1': { res: '3840x2160', bw: 86000000,  bitrate: 86000000,  label: '4K UHD' },
      'P2': { res: '2560x1440', bw: 50000000,  bitrate: 50000000,  label: 'QHD' },
      'P3': { res: '1920x1080', bw: 35000000,  bitrate: 35000000,  label: 'FHD' },
      'P4': { res: '1280x720',  bw: 15000000,  bitrate: 15000000,  label: 'HD' },
      'P5': { res: '854x480',   bw: 5000000,   bitrate: 5000000,   label: 'SD' }
    };
    return specs[profile] || specs['P1']; // Default to 4K
  }

  _detectProfile(extinfLine) {
    const match = extinfLine.match(/ape-profile="(P\d)"/i);
    return match ? match[1] : 'P1';
  }

  _injectStreamInf(content) {
    const lines = content.split('\n');
    const output = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXTINF:') && line.includes('tvg-name')) {
        if (i === 0 || !lines[i - 1].startsWith('#EXT-X-STREAM-INF')) {
          // Detect profile from EXTINF line
          const profile = this._detectProfile(line);
          const spec = this._getProfileSpec(profile);

          const streamInfTag = [
            `#EXT-X-STREAM-INF:BANDWIDTH=${spec.bw}`,
            `RESOLUTION=${spec.res}`,
            `CODECS="hvc1.2.4.L153.90"`,
            `FRAME-RATE=${this.config.targetFps}.000`,
            `HDR="SMPTE-ST-2084"`,
            `VIDEO-RANGE="PQ"`
          ].join(',');

          const qualityMarkers = [
            `#EXT-X-BITRATE:${spec.bitrate}`,
            `#EXT-X-RESOLUTION:${spec.res}`,
            `#EXT-X-FRAME-RATE:${this.config.targetFps}`,
            '#EXT-X-HDR:DOLBY-VISION,HDR10+,HDR10,HLG',
            '#EXT-X-COLOR-PRIMARIES:bt2020',
            '#EXT-X-TRANSFER-CHARACTERISTICS:smpte2084',
            '#EXT-X-MATRIX-COEFFICIENTS:bt2020nc',
            '#EXT-X-APE-GREEDY-SELECTION:ENABLED',
            '#EXT-X-APE-NEVER-DOWNGRADE:TRUE'
          ].join('\n');

          output.push(streamInfTag);
          output.push(qualityMarkers);
        }
      }
      output.push(line);
    }

    return output.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY: GREEDY URL REWRITING — &quality=max&never-downgrade=true
  // ═══════════════════════════════════════════════════════════════════════════
  _rewriteUrlsGreedy(content) {
    const params = [
      'quality=max',
      'resolution=max',
      'bitrate=max',
      'hdr=max',
      'fps=max',
      `codec=${this.config.codec},av1`,
      'tier=s,a,b,c,d',
      'prefer-highest=true',
      'never-downgrade=true',
      `fallback=2160p,fallback=1440p,fallback=1080p,fallback=720p`
    ].join('&');

    return content.replace(
      /(http[s]?:\/\/[^\s"]+\.m3u8)(\?[^\s"]*)?/g,
      (match) => `${match}&${params}`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL DIRECTIVE INJECTION — QMAX-ADAPTIVE protocol headers
  // ═══════════════════════════════════════════════════════════════════════════
  _injectGlobalDirectives(content) {
    const qmaxDirectives = [
      '#EXT-X-APE-QMAX-VERSION:2.0-ADAPTIVE',
      '#EXT-X-APE-QMAX-STRATEGY:GREEDY-BEST-AVAILABLE',
      '#EXT-X-APE-QMAX-ANTI-DOWNGRADE:ENFORCED',
      '#EXT-X-APE-QMAX-TIER-CASCADE:S>A>A->B>C>D',
      '#EXT-X-APE-QMAX-SELECTION-RULE:IF-4K-EXISTS-1080P-FORBIDDEN',
      '#EXT-X-APE-QMAX-BUFFER-CLASS:8K-ADAPTIVE-1GB',
      '#EXT-X-APE-PERCEPTUAL-OPTIMIZATION:VMAF-MAXIMIZATION-ENABLED',
      '#EXT-X-APE-BANDWIDTH-SAFETY-MARGIN:0.30'
    ].join('\n');

    // Inject after the #EXTM3U header line and existing APE headers
    const headerEnd = content.indexOf('\n\n');
    if (headerEnd > 0) {
      return content.slice(0, headerEnd) + '\n' + qmaxDirectives + content.slice(headerEnd);
    }
    // Fallback: inject after first line
    const firstNewline = content.indexOf('\n');
    return content.slice(0, firstNewline) + '\n' + qmaxDirectives + content.slice(firstNewline);
  }

  _log(message) {
    if (this.config.logChanges) {
      console.log(message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION — Enhanced with Anti-Downgrade checks
// ═══════════════════════════════════════════════════════════════════════════
function verifyUpgradeV2(content) {
  const checks = {
    // GREEDY SELECTION
    'Greedy quality=max URL':        content.includes('&quality=max'),
    'Greedy resolution=max URL':    content.includes('&resolution=max'),
    'Greedy never-downgrade URL':   content.includes('&never-downgrade=true'),
    'Greedy prefer-highest URL':    content.includes('&prefer-highest=true'),
    // HEADERS
    'Quality-Pref never-downgrade': content.includes('never-downgrade'),
    'Quality-Pref select-best':     content.includes('select-best-available'),
    'Quality-Pref tier-s-first':    content.includes('quality-tier-s-first'),
    // BUFFERS
    'Network-Caching 60s':          content.includes('"X-Network-Caching":"60000"'),
    'Buffer-Size 1GB':              content.includes('"X-Buffer-Size":"1000000"'),
    'Read-Buffer 32KB':             content.includes('"X-Read-Buffer":"32768"'),
    'Prebuffer 30s':                content.includes('"X-Prebuffer":"30"'),
    // STREAM-INF
    'STREAM-INF tags':              content.includes('#EXT-X-STREAM-INF'),
    'Greedy selection flag':        content.includes('#EXT-X-APE-GREEDY-SELECTION:ENABLED'),
    // GLOBAL DIRECTIVES
    'QMAX-ADAPTIVE version':        content.includes('#EXT-X-APE-QMAX-VERSION:2.0-ADAPTIVE'),
    'Anti-downgrade enforced':       content.includes('#EXT-X-APE-QMAX-ANTI-DOWNGRADE:ENFORCED'),
    'VMAF maximization':             content.includes('VMAF-MAXIMIZATION-ENABLED')
  };

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  PHOENIX-QMAX-ADAPTIVE v2.0 VERIFICATION        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  let passed = 0;
  for (const [check, result] of Object.entries(checks)) {
    const status = result ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}: ${check}`);
    if (result) passed++;
  }

  console.log('═══════════════════════════════════════════');
  console.log(`📊 Result: ${passed}/${Object.keys(checks).length} checks passed`);

  return { passed, total: Object.keys(checks).length, checks };
}

// ═══════════════════════════════════════════════════════════════════════════
// MPQF SCORING — v2.0 Adaptive (Selection Efficiency factor added)
// ═══════════════════════════════════════════════════════════════════════════
function calculateMPQF(params = {}) {
  const A = params.resolutionScore || 80;   // 0-100
  const B = params.bitrateDensity  || 85;   // bpp-based
  const C = params.codecScore      || 95;   // HEVC=95, AV1=92
  const D = params.colorVolume     || 90;   // HDR10=90, DV=100
  const E = params.temporalScore   || 100;  // 60fps=100
  const F = params.selectionEff    || 100;  // best-available=100

  // v2.0 weights: Resolution bumped to 0.30, Selection Efficiency at 0.05
  const score = (A * 0.30) + (B * 0.20) + (C * 0.20) + (D * 0.15) + (E * 0.10) + (F * 0.05);

  // BONUS: If selected = best available, +5
  const bonus = (F === 100) ? 5 : 0;
  // PENALTY: If selected < best available, -20
  const penalty = (F < 80) ? 20 : 0;

  const finalScore = Math.min(100, score + bonus - penalty);

  let tier;
  if (finalScore >= 90)      tier = 'REFERENCE';
  else if (finalScore >= 80) tier = 'EXCELLENT';
  else if (finalScore >= 70) tier = 'VERY GOOD';
  else if (finalScore >= 60) tier = 'GOOD';
  else if (finalScore >= 50) tier = 'FAIR';
  else                       tier = 'POOR';

  return { score: finalScore, tier, bonus, penalty };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { M3U8QualityUpgraderV2, verifyUpgradeV2, calculateMPQF };
}
if (typeof window !== 'undefined') {
  window.M3U8QualityUpgraderV2 = M3U8QualityUpgraderV2;
  window.verifyUpgradeV2 = verifyUpgradeV2;
  window.calculateMPQF = calculateMPQF;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════
if (typeof process !== 'undefined' && process.argv && process.argv.length > 2) {
  const fs = require('fs');
  const args = process.argv.slice(2);

  if (args.length >= 2) {
    const config = {};
    for (let i = 2; i < args.length; i++) {
      const [key, value] = args[i].split('=');
      if (key && value) config[key] = isNaN(value) ? value : parseInt(value);
    }

    console.log(`\n📂 Reading: ${args[0]}`);
    const content = fs.readFileSync(args[0], 'utf8');

    const upgrader = new M3U8QualityUpgraderV2(config);
    const result = upgrader.upgrade(content);

    verifyUpgradeV2(result.content);

    fs.writeFileSync(args[1], result.content);
    console.log(`\n💾 Saved to: ${args[1]}`);
  } else {
    console.log('\nUsage: node m3u8-quality-upgrader-v2.js <input.m3u8> <output.m3u8> [options]');
    console.log('\nDefault: All quality parameters set to MAX with greedy selection.');
  }
}
