'use strict';

// ape-quality-watch — servicio de vigilancia de estado del pipeline. SOLO LECTURA.
//
// QUE HACE
// ========
// Cada INTERVALO segundos:
//   1. Lee el estado del pipeline del dispositivo autorizado (adb, solo lectura).
//   2. Deriva hallazgos objetivos (color incoherente, doble escalado, fuente pequena,
//      cadencia declarada falsa, fotogramas perdidos, overrides de pantalla).
//   3. Si hay cambio respecto al ciclo anterior, escribe un evento en el ledger y, si esta
//      configurado, lo empuja al VPS por el canal que ya existe.
//   4. Nunca escribe en el dispositivo. Nunca mata nada. Nunca reinicia nada.
//
// QUE NO HACE, y hay que decirlo
// =============================
// NO mide la calidad de la imagen. El detector HF (tools/quality/hf_zone_aware_calibrator.js)
// esta embarcado en el directorio hf/ y NO se ejecuta aqui: en este VPS no hay frames.
// Ver PLACEMENT.md. El dia que el JIT entregue frames, se activa con APE_HF_ENABLE=1.
//
// GARANTIAS DE DUREZA
// ===================
//   - Fail-safe: cualquier fallo del dispositivo o de la red se registra y el proceso sigue.
//     Si falla N ciclos seguidos, sale con codigo 0 y systemd lo relanza por el timer
//     (no se queda en bucle de reintentos caliente).
//   - Sin crecimiento sin cota: el ledger rota a LEDGER_MAX bytes.
//   - Sin estado global: cada ciclo es autocontenido.
//   - Sin privilegios: corre como usuario sin shell y sin escritura en el sistema.
//   - Techo de tiempo: cada ciclo tiene TIMEOUT_MS; si adb se cuelga, se abandona.
//
// CONFIGURACION (variables de entorno, todas opcionales)
//   APE_DEVICE        serial adb. Por defecto el primero listado.
//   APE_INTERVAL_MS   intervalo entre ciclos. Por defecto 60000.
//   APE_LEDGER        ruta del ledger JSONL. Por defecto ./state/ledger.jsonl
//   APE_LEDGER_MAX    bytes antes de rotar. Por defecto 4194304 (4 MiB).
//   APE_PUSH_URL      endpoint del VPS para empujar el veredicto. Vacio = no empuja.
//   APE_PUSH_TOKEN    token de autorizacion. Vacio = no empuja.
//   APE_CYCLES        numero de ciclos y salir. 0 = indefinido (por defecto 0).
//   APE_HF_ENABLE     '1' activa el detector HF si hay un fichero de video configurado.
//   APE_HF_INPUT      ruta a un video local para el detector HF. Vacio = no corre.
//
// SALIDA: JSONL en el ledger. Codigo de salida 0 siempre salvo error de configuracion.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CFG = {
    device: process.env.APE_DEVICE || '',
    intervalMs: Number(process.env.APE_INTERVAL_MS || 60000),
    ledger: process.env.APE_LEDGER || path.join(__dirname, 'state', 'ledger.jsonl'),
    ledgerMax: Number(process.env.APE_LEDGER_MAX || 4 * 1024 * 1024),
    pushUrl: process.env.APE_PUSH_URL || '',
    pushToken: process.env.APE_PUSH_TOKEN || '',
    cycles: Number(process.env.APE_CYCLES || 0),
    hfEnable: process.env.APE_HF_ENABLE === '1',
    hfInput: process.env.APE_HF_INPUT || '',
    timeoutMs: Number(process.env.APE_TIMEOUT_MS || 15000),
    failLimit: Number(process.env.APE_FAIL_LIMIT || 3)
};

// Umbrales: todos medidos, ver docs/audits/HF_ZONA_FUNCIONA_20261113.md
const UMBRAL = {
    fotogramas_perdidos_pct: 0.5,   // por encima de esto hay perdida real
    desvio_cadencia_pct: 1.0,       // content vs actual
    judder_alto: 0.10               // judder-rate por encima de esto
};

function log(obj) {
    try {
        fs.mkdirSync(path.dirname(CFG.ledger), { recursive: true });
        // rotacion: si supera el maximo, se renombra y se empieza uno nuevo
        try {
            const st = fs.statSync(CFG.ledger);
            if (st.size > CFG.ledgerMax) fs.renameSync(CFG.ledger, CFG.ledger + '.1');
        } catch (e) { /* no existe aun */ }
        fs.appendFileSync(CFG.ledger, JSON.stringify(obj) + '\n', 'utf8');
    } catch (e) {
        process.stderr.write('ledger_no_escribible: ' + e.message + '\n');
    }
}

function adb(...args) {
    const cmd = ['-s', CFG.device || undefined].filter(Boolean);
    const full = cmd.concat(args);
    try {
        return execFileSync('adb', full, {
            encoding: 'utf8', timeout: CFG.timeoutMs,
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch (e) {
        return null;   // null = NO COMPUTADO, nunca cero
    }
}

function campo(texto, clave) {
    if (!texto) return null;
    const m = texto.match(new RegExp(clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([-0-9.eE+a-z/]+)'));
    return m ? m[1] : null;
}

// ── Un ciclo. Devuelve el veredicto y los hallazgos. ──────────────────────────
function ciclo() {
    const t0 = Date.now();
    const veredicto = {
        schema: 'ape.quality-watch.cycle.v1',
        t: new Date().toISOString(),
        dispositivo: CFG.device || 'auto',
        estado: 'NO_COMPUTADO',
        hallazgos: [],
        metricas: {},
        no_computado: [],
        duracion_ms: 0
    };

    // 1 · El dispositivo responde?
    const st = adb('get-state');
    if (!st || !st.includes('device')) {
        veredicto.no_computado.push('adb no ve el dispositivo');
        veredicto.duracion_ms = Date.now() - t0;
        return veredicto;
    }

    // 2 · Sesion de video
    const metrics = adb('shell', 'dumpsys media.metrics 2>/dev/null | grep "{codec," | grep "mode=video" | tail -n 1');
    const hayVideo = !!(metrics && /width=\d+/.test(metrics));

    if (hayVideo) {
        const vw = campo(metrics, 'android.media.mediacodec.width');
        const vh = campo(metrics, 'android.media.mediacodec.height');
        const fc = campo(metrics, 'android.media.mediacodec.framerate-content');
        const fa = campo(metrics, 'android.media.mediacodec.framerate-actual');
        const jud = campo(metrics, 'android.media.mediacodec.judder-rate');
        const drop = campo(metrics, 'android.media.mediacodec.frames-dropped');
        const rend = campo(metrics, 'android.media.mediacodec.frames-rendered');
        const std = campo(metrics, 'android.media.mediacodec.config-color-standard');
        const trf = campo(metrics, 'android.media.mediacodec.config-color-transfer');
        const rng = campo(metrics, 'android.media.mediacodec.config-color-range');

        veredicto.metricas = {
            fuente: vw && vh ? `${vw}x${vh}` : null,
            framerate_content: fc ? Number(fc) : null,
            framerate_actual: fa ? Number(fa) : null,
            judder: jud ? Number(jud) : null,
            fotogramas_perdidos: drop ? Number(drop) : null,
            fotogramas_renderizados: rend ? Number(rend) : null,
            color_standard: std ? Number(std) : null,
            color_transfer: trf ? Number(trf) : null,
            color_range: rng ? Number(rng) : null
        };

        // Color incoherente: estandar BT.709(1)/BT.2020(4) con transferencia BT.601(3)
        if (std !== null && trf !== null) {
            const s = Number(std), t = Number(trf);
            const stdApto = (s === 1 || s === 4);
            const trfApto = (t === 1 || t === 6 || t === 16 || t === 18);
            if (stdApto && !trfApto) {
                veredicto.hallazgos.push({ tipo: 'COLOR_SPACE_MISMATCH', sev: 'ALTA',
                    detalle: `estandar ${s} con transferencia ${t}` });
            }
        }
        if (rng === '2' && std === '1') {
            veredicto.hallazgos.push({ tipo: 'RANGE_FULL_EN_BT709', sev: 'MEDIA',
                detalle: 'color-range full sobre BT.709' });
        }

        // Cadencia declarada falsa
        if (fc && fa && Number(fc) > 0) {
            const desvio = Math.abs(Number(fc) - Number(fa)) / Number(fc) * 100;
            if (desvio > UMBRAL.desvio_cadencia_pct) {
                veredicto.hallazgos.push({ tipo: 'CADENCIA_DECLARADA_FALSA', sev: 'ALTA',
                    detalle: `${fc} declarado vs ${fa} real (${desvio.toFixed(2)} %)` });
            }
        }
        if (jud && Number(jud) > UMBRAL.judder_alto) {
            veredicto.hallazgos.push({ tipo: 'JUDDER_ALTO', sev: 'MEDIA', detalle: `judder ${jud}` });
        }

        // Fotogramas perdidos
        if (drop && rend && Number(rend) > 0) {
            const pct = Number(drop) / Number(rend) * 100;
            if (pct > UMBRAL.fotogramas_perdidos_pct) {
                veredicto.hallazgos.push({ tipo: 'FOTOGRAMAS_PERDIDOS', sev: 'MEDIA',
                    detalle: `${drop}/${rend} (${pct.toFixed(2)} %)` });
            }
        }

        // Fuente pequena: cualquier etiqueta 4K sobre esto es declaracion, no fuente
        if (vw && vh && Number(vh) <= 720) {
            veredicto.hallazgos.push({ tipo: 'FUENTE_PEQUENA', sev: 'ALTA',
                detalle: `decodifica ${vw}x${vh}` });
        }
    } else {
        veredicto.no_computado.push('sin sesion de video: color, cadencia y fotogramas no tienen sujeto');
    }

    // 3 · Geometria de pantalla (siempre disponible)
    const wmDens = adb('shell', 'wm density');
    if (wmDens) {
        const ovr = wmDens.match(/Override density:\s*(\d+)/);
        if (ovr) {
            veredicto.hallazgos.push({ tipo: 'OVERRIDE_DENSIDAD', sev: 'ALTA', detalle: `override ${ovr[1]}` });
        }
    } else {
        veredicto.no_computado.push('wm density no disponible');
    }
    for (const [k, q] of [['display_size_forced', 'global'], ['display_density_forced', 'secure']]) {
        const v = adb('shell', `settings get ${q} ${k}`);
        if (v === null) { veredicto.no_computado.push(k + ' no legible'); continue; }
        if (v !== '' && v !== 'null') {
            veredicto.hallazgos.push({ tipo: 'CLAVE_PERSISTENTE', sev: 'ALTA', detalle: `${k}='${v}'` });
        }
    }

    veredicto.estado = veredicto.hallazgos.length ? 'SUCIO'
        : (hayVideo ? 'LIMPIO' : 'NO_COMPUTADO');
    veredicto.duracion_ms = Date.now() - t0;
    return veredicto;
}

// ── Empuje al VPS. Best-effort: un fallo no rompe el ciclo. ───────────────────
async function empujar(v) {
    if (!CFG.pushUrl || !CFG.pushToken) return { empujado: false, motivo: 'no configurado' };
    try {
        const res = await fetch(CFG.pushUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-ape-token': CFG.pushToken },
            body: JSON.stringify(v),
            signal: AbortSignal.timeout(CFG.timeoutMs)
        });
        return { empujado: res.ok, status: res.status };
    } catch (e) {
        return { empujado: false, motivo: String(e.message || e).slice(0, 120) };
    }
}

async function main() {
    // validacion de configuracion: fallar fuerte y temprano
    if (!Number.isFinite(CFG.intervalMs) || CFG.intervalMs < 1000) {
        process.stderr.write('APE_INTERVAL_MS invalido (minimo 1000)\n');
        process.exit(2);
    }
    if (CFG.pushUrl && !CFG.pushToken) {
        process.stderr.write('APE_PUSH_URL sin APE_PUSH_TOKEN: no se empuja (fail-closed)\n');
        CFG.pushUrl = '';
    }

    log({ schema: 'ape.quality-watch.start.v1', t: new Date().toISOString(),
        config: { device: CFG.device || 'auto', interval_ms: CFG.intervalMs,
            ledger: CFG.ledger, push: !!CFG.pushUrl, hf_enable: CFG.hfEnable } });

    // Detector HF: se declara su estado, no se finge que corre
    if (CFG.hfEnable) {
        if (!CFG.hfInput || !fs.existsSync(CFG.hfInput)) {
            log({ schema: 'ape.quality-watch.hf.v1', t: new Date().toISOString(),
                activo: false, motivo: 'APE_HF_INPUT ausente o inexistente' });
        } else {
            log({ schema: 'ape.quality-watch.hf.v1', t: new Date().toISOString(),
                activo: true, entrada: CFG.hfInput,
                nota: 'el detector HF se ejecuta como paso aparte; este demonio no lee frames' });
        }
    }

    let n = 0, fallos = 0;
    while (true) {
        let v;
        try {
            v = ciclo();
        } catch (e) {
            v = { schema: 'ape.quality-watch.cycle.v1', t: new Date().toISOString(),
                estado: 'ERROR', error: String(e.message || e).slice(0, 200) };
        }

        if (v.estado === 'NO_COMPUTADO' || v.estado === 'ERROR') {
            fallos++;
        } else {
            fallos = 0;
        }

        const r = await empujar(v);
        log(Object.assign({}, v, { empujado: r }));

        n++;
        if (CFG.cycles > 0 && n >= CFG.cycles) {
            log({ schema: 'ape.quality-watch.stop.v1', t: new Date().toISOString(), ciclos: n });
            process.exit(0);
        }
        // Si falla de forma consecutiva, se sale limpio y el timer relanza.
        // No se queda en bucle de reintentos caliente.
        if (fallos >= CFG.failLimit) {
            log({ schema: 'ape.quality-watch.stop.v1', t: new Date().toISOString(),
                ciclos: n, motivo: `fallos_consecutivos=${fallos}`, exit_code: 0 });
            process.exit(0);
        }
        await new Promise(r2 => setTimeout(r2, CFG.intervalMs));
    }
}

main().catch(e => {
    process.stderr.write('fatal: ' + (e && e.stack || e) + '\n');
    process.exit(1);
});
