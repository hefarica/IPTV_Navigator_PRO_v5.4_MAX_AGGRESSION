// Build LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json a partir del -DNR.json (read-only)
// Cambios: video-filter Crystal por tier + policy + scd fix global + version bump. Todo lo demas IDENTICO.
const fs = require('fs');
const SRC = 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json';
const DST = 'C:/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json';

const raw = fs.readFileSync(SRC, 'utf8');
const j = JSON.parse(raw);
const pretty = raw.includes('\n  "'); // detectar formato
const before = JSON.stringify(j);

// ── 1) Fix global del tail minterpolate (scd=5 invalido y scd=0) en TODO el objeto ──
const OLD_TAIL = 'minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=';
const NEW_TAIL = 'minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=fdiff:scd_threshold=8';
const fixedPaths = [];
(function walk(o, path) {
    if (typeof o === 'string') {
        const m = o.match(/minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=(\d+(?:\.\d+)?)/);
        if (m) { fixedPaths.push(path + ' (scd=' + m[1] + ')'); j.__SET__ = true; }
    } else if (Array.isArray(o)) o.forEach((v, i) => walk(v, path + '[' + i + ']'));
    else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], path + '.' + k);
})(j, '$');
// reemplazo real del tail
const deepFix = (o) => {
    if (typeof o === 'string') {
        const i = o.indexOf(OLD_TAIL);
        if (i !== -1) return o.slice(0, i) + NEW_TAIL;
        return o;
    }
    if (Array.isArray(o)) return o.map(deepFix);
    if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = deepFix(o[k]); }
    return o;
};
deepFix(j);

// ── 2) Cadenas Crystal por tier (video-filter) ──
const MEMC = NEW_TAIL;
const Z_PQ   = 'zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full';                 // P0 nativo
const Z_PQ4K = 'zscale=w=3840:h=2160:filter=lanczos:transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full'; // P1
const Z_SDR  = 'zscale=w=3840:h=2160:filter=lanczos:transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full';     // P2-P5
const US50 = 'unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.5:chroma_amount=0.0';
const US40 = 'unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.4:chroma_amount=0.0';
const GF = 'gradfun=radius=16:strength=1.2';
const BWDIF = 'bwdif=mode=1:parity=-1:deint=0';
const YADIF = 'yadif=mode=1:parity=-1:deint=0';

const CHAINS = {
    P0: `nlmeans=s=3.0:p=7:r=15,atadenoise,${BWDIF},${GF},${Z_PQ},${US50},${MEMC}`,
    P1: `nlmeans=s=3.0:p=7:r=15,atadenoise,${BWDIF},${GF},${Z_PQ4K},${US50},${MEMC}`,
    P2: `nlmeans=s=2.8:p=6:r=13,atadenoise,${GF},${Z_SDR},${US50},${MEMC}`,
    P3: `nlmeans=s=2.5:p=5:r=11,atadenoise,${BWDIF},${GF},${Z_SDR},${US50},${MEMC}`,
    P4: `hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,atadenoise,${YADIF},${GF},${Z_SDR},${US40},${MEMC}`,
    P5: `hqdn3d=luma_spatial=3.0:chroma_spatial=2.0:luma_tmp=4.0:chroma_tmp=3.0,atadenoise,${GF},${Z_SDR},${US40},${MEMC}`
};

// ── 3) Policies (4 capas, misma estructura que el LAB) ──
const POL = {
    P0: 'AI_DNR_HW+NLMEANS3.0+ATADENOISE+GRADFUN1.2+CRYSTAL4K-NATIVE-PQ+SCD-FDIFF8',
    P1: 'AI_DNR_HW+NLMEANS3.0+ATADENOISE+GRADFUN1.2+CRYSTAL4K-LANCZOS-PQ+SCD-FDIFF8',
    P2: 'AI_DNR_HW+NLMEANS2.8+ATADENOISE+GRADFUN1.2+CRYSTAL4K-LANCZOS+SCD-FDIFF8',
    P3: 'AI_DNR_HW+NLMEANS2.5+ATADENOISE+GRADFUN1.2+CRYSTAL4K-LANCZOS+SCD-FDIFF8',
    P4: 'AI_DNR_HW+HQDN3D2.0-1.5-3.0-2.5+ATADENOISE+GRADFUN1.2+CRYSTAL4K-LANCZOS+SCD-FDIFF8',
    P5: 'AI_DNR_HW+HQDN3D3.0-2.0-4.0-3.0-SD+ATADENOISE+GRADFUN1.2+CRYSTAL4K-LANCZOS+SCD-FDIFF8'
};
const pol4 = p => Array(4).fill(POL[p]).join(',');

for (const p of Object.keys(CHAINS)) {
    j.profiles_calibrated[p].vlcopt['video-filter'] = CHAINS[p];
    if (j.profiles_calibrated[p].headerOverrides) {
        j.profiles_calibrated[p].headerOverrides['X-APE-DNR-POLICY'] = pol4(p);
    }
}
// ── 2b) AV-SYNC (2026-08-30): clock-synchro=1 en los 3 planos del LAB ──
// vlcopt ya traía "1", pero player_enslavement.level_3 y actor_injections.player.vlc
// traían 0 — el upsert de actors (generador L9558) corre al final y pisaba el default.
for (const p of Object.keys(j.profiles_calibrated)) {
    const pr = j.profiles_calibrated[p];
    if (pr.vlcopt) pr.vlcopt['clock-synchro'] = '1';
    try { pr.player_enslavement.level_3_per_channel.EXTVLCOPT['clock-synchro'] = 1; } catch (e) {}
    try {
        pr.actor_injections.player.vlc.clock_synchro = 1;
        if ('audio_time_stretch' in pr.actor_injections.player.vlc) pr.actor_injections.player.vlc.audio_time_stretch = 1;
    } catch (e) {}
}

j.version = '22.6.0-CRYSTAL-4K-UHD';
if (j.dnr_calibration && typeof j.dnr_calibration.dnr_version === 'string') {
    j.dnr_calibration.dnr_version = j.dnr_calibration.dnr_version + '-crystal-4k';
}

delete j.__SET__;

// ── 4) Escritura + validacion ──
fs.writeFileSync(DST, pretty ? JSON.stringify(j, null, 2) : JSON.stringify(j));
const out = JSON.parse(fs.readFileSync(DST, 'utf8'));

let errs = [];
for (const p of ['P0','P1','P2','P3','P4','P5']) {
    const c = out.profiles_calibrated[p].vlcopt['video-filter'];
    if (!c.includes('atadenoise')) errs.push(p + ' sin atadenoise');
    if (!c.includes('filter=lanczos') && p !== 'P0') errs.push(p + ' sin lanczos');
    if (p === 'P0' && c.includes('w=3840')) errs.push('P0 no debe forzar resize');
    if (!c.endsWith(MEMC)) errs.push(p + ' no termina en minterpolate scd=fdiff');
    if (!c.includes('gradfun')) errs.push(p + ' sin gradfun');
}
const flat = JSON.stringify(out);
if (/scd=5[^.]/.test(flat)) errs.push('queda scd=5');
if (/scd=0[",]/.test(flat)) errs.push('queda scd=0');
if (flat.includes('scd=fdiff:scd_threshold=8') === false) errs.push('fdiff ausente');

// diff de contencion: rutas cambiadas vs original
const changed = [];
const diffWalk = (a, b, path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) { if (!(k in a)) changed.push(path + '.' + k + ' (NUEVO)'); else if (!(k in b)) changed.push(path + '.' + k + ' (BORRADO)'); else diffWalk(a[k], b[k], path + '.' + k); }
    } else changed.push(path);
};
diffWalk(JSON.parse(before), out, '$');

console.log('FORMATO:', pretty ? 'pretty' : 'minificado');
console.log('tails scd corregidos en:', fixedPaths.join(' | ') || '(ninguno fuera de perfiles)');
console.log('VALIDACION:', errs.length ? 'ERRORES: ' + errs.join('; ') : 'TODO OK');
console.log('RUTAS MODIFICADAS vs -DNR.json:');
for (const c of changed) console.log('  ' + c);
console.log('bytes nuevo:', fs.statSync(DST).size);
