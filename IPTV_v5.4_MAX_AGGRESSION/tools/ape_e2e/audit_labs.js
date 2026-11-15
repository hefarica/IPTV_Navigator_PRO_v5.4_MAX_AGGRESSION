// AUDITORIA COMPARATIVA — LAB CALIBRATED original vs -DNR
// Rubro alineado a doctrina repo: MEMC-TOTAL-8K120, 4K False Supremo, MAX IMAGE FIRST, truth-guards.
const fs = require('fs');
const ORIG = 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120.json';
const DNR  = 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json';

function load(p) {
    const raw = fs.readFileSync(p, 'utf8');
    return { raw, j: JSON.parse(raw.replace(/^\uFEFF/, '')) };
}
const A = load(ORIG), B = load(DNR);
const PIDS = ['P0','P1','P2','P3','P4','P5'];
const BANNED = ['If-None-Match','If-Modified-Since','Range','TE','Priority','Upgrade-Insecure-Requests'];

function audit(tag, {raw, j}) {
    const r = { tag, size: Buffer.byteLength(raw) };
    r.version = j.version; r.lab_version = j.lab_version; r.variant = j.lab_schema_variant;
    r.bulletproof = j.bulletproof === true; r.format = j.playlist_format;
    r.exported_at = j.exported_at;
    r.nivel1 = (j.nivel1_directives || []).length;
    r.nivel1_dnr = (j.nivel1_directives || []).some(d => /DNR-CALIBRATION/.test(d.tag||''));
    r.dnr_block = !!j.dnr_calibration;

    // Perfiles (contenedor real: profiles_calibrated)
    r.profiles = {};
    let bannedHits = [];
    for (const pid of PIDS) {
        const p = (j.profiles_calibrated || {})[pid]; if (!p) { r.profiles[pid] = null; continue; }
        const vf = (p.vlcopt || {})['video-filter'] || '';
        const st = p.settings || {};
        const o = {
            hasVF: !!vf,
            vf_denoise: /nlmeans|hqdn3d/.test(vf),
            vf_nlmeans: /nlmeans/.test(vf),
            vf_hqdn3d: /hqdn3d/.test(vf),
            vf_gradfun: /gradfun/.test(vf),
            vf_unsharp: /unsharp/.test(vf),
            vf_zscale: /zscale/.test(vf),
            vf_bwdif: /bwdif|yadif/.test(vf),
            vf_memc: /minterpolate=fps=120/.test(vf),
            vf_memc_end: /minterpolate=fps=120[^,]*$/.test(vf.trim()),
            vf_scd: (vf.match(/scd=(\d)/)||[])[1] || null,
            fps120: st.fps === 120 && st.targetFps === 120 && st.target_framerate === '120FPS',
            vlcopt_fps: (p.vlcopt||{})['video-fps'] === 120,
            kodi_fps: ((p.kodiprop||{})['inputstream.adaptive.preferred_video_frame_rate'] === 120),
            l3_framerate: (((p.player_enslavement||{}).level_3_per_channel||{})['STREAM-INF']||{}).FRAME_RATE === '120.000',
            res: st.resolution || st.maxResolution,
            vlcopt_wh: [(p.vlcopt||{})['video-width'], (p.vlcopt||{})['video-height']],
            adapt_wh: [(p.vlcopt||{})['adaptive-maxwidth'], (p.vlcopt||{})['adaptive-maxheight']],
            hdr_fps: ((p.headerOverrides||{})['X-APE-FPS']||'').split(',').length,
            res_hdr: !!(p.headerOverrides||{})['X-APE-RESOLUTION'],
            omega_build: JSON.stringify(((p.player_enslavement||{}).level_1_master_playlist||[])).includes('OMEGA_BUILD'),
            hdr_canonical: st.hdr_canonical, nits: st.nits_target,
            codec_primary: st.codec_primary,
            knobs: Object.keys(p.optimized_knobs || {}).length,
            actor_sections: Object.keys(p.actor_injections || {}).length,
            soc_vpp_dnr: !!(p.actor_injections||{}).soc_vpp_dnr,
            soc_settings: Object.keys(((p.actor_injections||{}).soc_vpp_dnr||{}).settings || {}).length,
            soc_deportes_dnr_off: (((p.actor_injections||{}).soc_vpp_dnr||{}).content_overrides||{}).deportes !== undefined,
            soc_rollback: /rollback|off/i.test(JSON.stringify((p.actor_injections||{}).soc_vpp_dnr||{})),
            dnr_policy: ((p.headerOverrides||{})['X-APE-DNR-POLICY']||'').split(',').filter(Boolean).length,
            kodiprop_n: Object.keys(p.kodiprop||{}).length,
            hlsjs_n: Object.keys(p.hlsjs||{}).length,
            headers_n: Object.keys(p.headerOverrides||{}).length,
        };
        r.profiles[pid] = o;
        for (const k of Object.keys(p.headerOverrides||{})) if (BANNED.includes(k)) bannedHits.push(pid+':'+k);
        // toxic tambien en vlcopt (Range/TE etc. no son vlcopt keys validas de header http — solo nombres exactos)
    }
    r.banned_hits = bannedHits;

    // Conteo global de directo DNR en video-filters
    r.dnr_profiles = PIDS.filter(pid => r.profiles[pid] && r.profiles[pid].vf_denoise).length;
    r.memc_profiles = PIDS.filter(pid => r.profiles[pid] && r.profiles[pid].vf_memc).length;
    r.soc_profiles = PIDS.filter(pid => r.profiles[pid] && r.profiles[pid].soc_vpp_dnr).length;
    r.policy_profiles = PIDS.filter(pid => r.profiles[pid] && r.profiles[pid].dnr_policy > 0).length;
    return r;
}

const RA = audit('ORIGINAL', A), RB = audit('DNR', B);

// ── CONTAINMENT: B ⊇ A (secciones intactas, solo aditivo) ──
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
const contain = { ok: true, notes: [] };
if (A.j.version !== B.j.version || A.j.exported_at !== B.j.exported_at) { contain.ok = false; contain.notes.push('version/exported_at difieren'); }
for (const pid of PIDS) {
    const pa = A.j.profiles_calibrated[pid], pb = B.j.profiles_calibrated[pid];
    for (const sec of ['settings','kodiprop','hlsjs','prefetch_config','player_enslavement','bounds','fitness']) {
        if (!deepEq(pa[sec], pb[sec])) { contain.ok = false; contain.notes.push(pid+'.'+sec+' difiere'); }
    }
    for (const [k,v] of Object.entries(pa.vlcopt)) if (k !== 'video-filter' && pb.vlcopt[k] !== v) { contain.ok = false; contain.notes.push(pid+'.vlcopt.'+k+' difiere'); }
    for (const [k,v] of Object.entries(pa.headerOverrides)) if (pb.headerOverrides[k] !== v) { contain.ok = false; contain.notes.push(pid+'.headerOverrides.'+k+' difiere'); }
    for (const [k,v] of Object.entries(pa.actor_injections)) if (!deepEq(v, pb.actor_injections[k])) { contain.ok = false; contain.notes.push(pid+'.actor_injections.'+k+' difiere'); }
    if (pa.vlcopt['video-filter'] && !pb.vlcopt['video-filter'].endsWith(pa.vlcopt['video-filter'])) { contain.ok = false; contain.notes.push(pid+'.video-filter suffix roto'); }
}
const n1a = A.j.nivel1_directives;
for (let i = 0; i < n1a.length; i++) if (JSON.stringify(n1a[i]) !== JSON.stringify(B.j.nivel1_directives[i])) { contain.ok = false; contain.notes.push('nivel1['+i+'] difiere'); }

// ── IMPRESION ──
function line(pid, o) {
    if (!o) return '  ' + pid + ': AUSENTE';
    return '  ' + pid + ': denoise=' + (o.vf_denoise ? 'SI(' + (o.vf_nlmeans ? 'nlmeans' : '') + (o.vf_nlmeans && o.vf_hqdn3d ? '+' : '') + (o.vf_hqdn3d ? 'hqdn3d' : '') + ')' : 'NO')
        + ' gradfun=' + (o.vf_gradfun?1:0) + ' unsharp=' + (o.vf_unsharp?1:0) + ' bwdif=' + (o.vf_bwdif?1:0)
        + ' MEMC120=' + (o.vf_memc?1:0) + '(end=' + (o.vf_memc_end?1:0) + ',scd=' + o.vf_scd + ')'
        + ' fps120=' + (o.fps120 && o.vlcopt_fps && o.kodi_fps && o.l3_framerate ? 'FULL' : 'PARCIAL')
        + ' res=' + o.res + ' hdr=' + o.hdr_canonical + '/' + o.nits + 'nits'
        + ' codec=' + o.codec_primary
        + ' SoC=' + (o.soc_vpp_dnr ? o.soc_settings + 'k' + (o.soc_deportes_dnr_off ? '+dep' : '') + (o.soc_rollback ? '+rb' : '') : 'NO')
        + ' pol=' + o.dnr_policy + ' hdrFPS=' + o.hdr_fps;
}
for (const R of [RA, RB]) {
    console.log('\n════════ ' + R.tag + ' ════════');
    console.log('size=' + (R.size/1024).toFixed(1) + 'KB  v=' + R.version + '  schema=' + R.lab_version + '/' + R.variant + '  bp=' + R.bulletproof + '  fmt=' + R.format + '  exported=' + R.exported_at);
    console.log('nivel1=' + R.nivel1 + (R.nivel1_dnr ? ' (+DNR-CALIBRATION)' : '') + '  dnr_block=' + R.dnr_block + '  banned=' + (R.banned_hits.length ? JSON.stringify(R.banned_hits) : '0'));
    console.log('cobertura: DNR-video=' + R.dnr_profiles + '/6  MEMC=' + R.memc_profiles + '/6  SoC=' + R.soc_profiles + '/6  policy=' + R.policy_profiles + '/6');
    for (const pid of PIDS) console.log(line(pid, R.profiles[pid]));
}
console.log('\n════════ CONTAINMENT DNR ⊇ ORIGINAL ════════');
console.log(contain.ok ? 'PERFECTO — aditivo puro, 0 secciones originales alteradas' : 'FALLOS: ' + contain.notes.join('; '));
console.log('excepciones autorizadas: vlcopt.video-filter P2/P5 (prefijo DNR), headerOverrides +X-APE-DNR-POLICY, actor_injections +soc_vpp_dnr, nivel1 +1, top-level +dnr_calibration');
