/**
 * buffer-input-demand.js — CONDICIÓN DE BUFFER: ENTRADA >= SALIDA x (1 + delta)
 * ============================================================================
 * Qué es: un módulo SIN dependencias (no toca el DOM, no toca la red, no usa
 *   Date.now ni Math.random) que convierte la regla que pidió la persona en una
 *   cuenta EXACTA y en una etiqueta POR CANAL que viaja dentro de la lista:
 *
 *       entrada_requerida_bps = salida_bps + ceil(salida_bps * delta_pct / 100)
 *
 *   - `salida` (OUTPUT) es el bitrate que el proveedor declara y que el player
 *     se come reproduciendo. NO se reduce nunca: es la imagen. El margen se
 *     reserva SIEMPRE en la entrada.
 *   - `delta` es un entero de 1 a 90 (%). Por defecto 10 %.
 *   - Todo se calcula en bits por segundo ENTEROS con aritmética entera
 *     (out*delta + 99) / 100 truncado: no hay coma flotante que redondee mal.
 *
 * Por qué así y no "medir cada ms":
 *   - La petición a la red es INNEGOCIABLE: sale de la salida declarada, no de
 *     una muestra. Una muestra mala NO puede bajar el suelo (si lo bajara, la
 *     regla se cumpliría sólo en el papel). La muestra sólo decide dos cosas:
 *     si hay déficit (SHORTFALL) y cuánto tarda en secarse el buffer.
 *   - El intervalo de medida tiene un límite FÍSICO y uno REAL:
 *       * físico: no puedes estar ciego más tiempo que el buffer garantizado
 *         (0,625 x T del envelope del LAB) -> `max_safe_ms`;
 *       * real: el medidor que ya existe en la app
 *         (js/ape-v9/streaming/bandwidth-meter-v1.js) agrega en bins de
 *         1000 ms (LAW.BIN_MS). Pedir 100 ms no crea resolución: aquí se
 *         declara `measurement_ms` y `resolution_ok` para no vender humo.
 *
 * Qué NO es: no reescribe el generador canónico, no cambia la salida mientras
 *   el flag esté apagado y no promete que un player aplique nada: la etiqueta
 *   declara la política; que el player la respete no se ha medido
 *   (measured_on_device = false).
 *
 * Uso en navegador: <script src=".../buffer-input-demand.js"></script>
 *                   window.APE_BUF_DEMAND.demand({outputBps: 18700000, deltaPct: 10})
 * Uso en node/tests: const D = require('../js/ape-v9/buffer-input-demand.js')
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.APE_BUF_DEMAND = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const TAG = '#EXT-X-APE-INPUT-DEMAND:';
    const RULE = 'input_bps >= output_bps + ceil(output_bps*delta_pct/100)';

    const DEFAULTS = {
        deltaPct: 10,
        minDeltaPct: 1,
        maxDeltaPct: 90,
        /* Muestras por profundidad de buffer: con 10 muestras por buffer, la
         * última detección llega cuando aún queda ~90 % del buffer. */
        samplesPerBuffer: 10,
        minSampleMs: 100,
        maxSampleMs: 1000,
        /* Granularidad REAL del medidor ya presente en la app
         * (bandwidth-meter-v1.js -> LAW.BIN_MS = 1000). No es una opinión. */
        measurementMs: 1000,
        /* Media exponencial: 0.3 deja ver una caída sostenida en ~3 muestras
         * sin que un bache de una sola muestra mueva la decisión. */
        ewmaAlpha: 0.3,
        /* Envelope del LAB: min_ms = 0.625 x T -> tiempo de buffer garantizado. */
        guaranteedBufferFactor: 0.625
    };

    // ── Aritmética entera exacta ────────────────────────────────────────────
    /** Entero positivo o NaN (nunca lanza, nunca inventa). */
    function posInt(v) {
        const n = Number(v);
        if (!isFinite(n) || n <= 0) return NaN;
        return Math.round(n);
    }

    /** Delta en % como entero 1..90. Vacío o basura -> 10 (el defecto). */
    function deltaPct(v) {
        const n = Number(v);
        if (!isFinite(n) || n === 0) return DEFAULTS.deltaPct;
        let d = Math.round(n);
        if (d < DEFAULTS.minDeltaPct) d = DEFAULTS.minDeltaPct;
        if (d > DEFAULTS.maxDeltaPct) d = DEFAULTS.maxDeltaPct;
        return d;
    }

    /**
     * Entrada requerida, en bps ENTEROS.
     * ceil(a/100) con a entero = floor((a+99)/100): exacto por debajo de 2^53
     * (200 Mbps * 90 = 1,8e10, muy por debajo).
     */
    function requiredBps(outputBps, d) {
        const out = posInt(outputBps);
        if (!isFinite(out)) return NaN;
        const dd = deltaPct(d);
        return out + Math.floor((out * dd + 99) / 100);
    }

    /** ¿Cumple la condición? (entrada >= requerida) */
    function meets(inputBps, outputBps, d) {
        const req = requiredBps(outputBps, d);
        const inp = posInt(inputBps);
        if (!isFinite(req) || !isFinite(inp)) return false;
        return inp >= req;
    }

    /**
     * Margen que AGUANTA el enlace, en % entero (0..90).
     * Sentido correcto de la pregunta: subir el delta SUBE la petición, así que
     * lo que se pregunta no es "qué delta hace falta" sino "cuánto margen cabe".
     *   0  = cabe la salida pero ni 1 % de margen.
     *   null = el enlace no llega ni a la salida: ningún delta lo arregla.
     */
    function maxAffordableDeltaPct(outputBps, linkBps) {
        const out = posInt(outputBps);
        const link = posInt(linkBps);
        if (!isFinite(out) || !isFinite(link)) return null;
        if (link < out) return null;
        let best = 0;
        for (let d = DEFAULTS.minDeltaPct; d <= DEFAULTS.maxDeltaPct; d++) {
            if (requiredBps(out, d) <= link) best = d; else break;
        }
        return best;
    }

    /** Compatibilidad: el delta MÍNIMO que la regla puede pedir es el mínimo. */
    function deltaNeededPct(outputBps, linkBps) {
        const out = posInt(outputBps);
        const link = posInt(linkBps);
        if (!isFinite(out) || !isFinite(link)) return null;
        return requiredBps(out, DEFAULTS.minDeltaPct) <= link ? DEFAULTS.minDeltaPct : null;
    }

    /** Delta exacto que haría falta (%, 2 decimales, truncado). Negativo = sobra. */
    function deltaNeededExactPct(outputBps, linkBps) {
        const out = posInt(outputBps);
        const link = posInt(linkBps);
        if (!isFinite(out) || !isFinite(link)) return null;
        return Math.floor(((link - out) * 10000) / out) / 100;
    }

    /**
     * Segundos hasta que el buffer se seca si el enlace va por debajo de la
     * salida: buffer / (1 - enlace/salida). null = no se seca (enlace >= salida).
     */
    function timeToDryS(bufferSec, outputBps, linkBps) {
        const b = Number(bufferSec);
        const out = posInt(outputBps);
        const link = Number(linkBps);
        if (!isFinite(b) || b <= 0 || !isFinite(out) || !isFinite(link) || link < 0) return null;
        if (link >= out) return null;
        return Math.round((b / (1 - link / out)) * 100) / 100;
    }

    // ── Muestreo: lo más fino que tiene sentido, no lo más fino que suena ──
    /**
     * Plan de muestreo para un buffer de `bufferMs` ms.
     *   requested_ms  : lo que se quiere medir (buffer/10, acotado 100..1000)
     *   max_safe_ms   : lo máximo que se puede estar ciego sin perder el buffer
     *                   garantizado (0,625 x T del envelope del LAB)
     *   measurement_ms: la granularidad REAL del medidor de la app (1000 ms)
     *   resolution_ok : true si el medidor es al menos tan fino como el plan
     */
    function samplePlan(bufferMs) {
        const b = Number(bufferMs);
        const hasBuf = isFinite(b) && b > 0;
        const maxSafe = hasBuf ? Math.floor(b * DEFAULTS.guaranteedBufferFactor) : NaN;
        let requested = hasBuf ? Math.round(b / DEFAULTS.samplesPerBuffer) : DEFAULTS.maxSampleMs;
        if (requested < DEFAULTS.minSampleMs) requested = DEFAULTS.minSampleMs;
        if (requested > DEFAULTS.maxSampleMs) requested = DEFAULTS.maxSampleMs;
        const meas = DEFAULTS.measurementMs;
        return {
            requested_ms: requested,
            max_safe_ms: isFinite(maxSafe) ? maxSafe : null,
            measurement_ms: meas,
            resolution_ok: isFinite(maxSafe) ? (meas <= maxSafe) : null,
            blind_ratio: isFinite(maxSafe) && maxSafe > 0 ? Math.round((meas / maxSafe) * 1000) / 1000 : null
        };
    }

    // ── La cuenta completa de un canal ─────────────────────────────────────
    /**
     * @param {{outputBps:number, deltaPct?:number, bufferMs?:number, linkBps?:number}} o
     */
    function demand(o) {
        const src = o || {};
        const out = posInt(src.outputBps);
        const d = deltaPct(src.deltaPct);
        const req = requiredBps(out, d);
        const bufferMs = (isFinite(Number(src.bufferMs)) && Number(src.bufferMs) > 0) ? Math.round(Number(src.bufferMs)) : null;
        const linkBps = posInt(src.linkBps);
        const v = {
            version: VERSION,
            rule: RULE,
            output_bps: isFinite(out) ? out : null,
            delta_pct: d,
            required_bps: isFinite(req) ? req : null,
            /* El suelo NUNCA es menor que la salida: si delta fuese 0, la
             * entrada ya tendría que igualar la salida. */
            floor_bps: isFinite(out) ? out : null,
            output_reduced: false,
            extra_bps: isFinite(req) && isFinite(out) ? req - out : null,
            sample: samplePlan(bufferMs),
            buffer_ms: bufferMs,
            measured_on_device: false
        };
        if (isFinite(linkBps)) {
            v.measured_bps = linkBps;
            v.feasible = isFinite(req) ? (linkBps >= req) : false;
            v.margin_bps = isFinite(req) ? linkBps - req : null;
            v.deficit_bps = isFinite(req) ? Math.max(0, req - linkBps) : null;
            v.delta_affordable_pct = maxAffordableDeltaPct(out, linkBps);
            v.delta_needed_pct = deltaNeededPct(out, linkBps);
            v.delta_needed_exact_pct = deltaNeededExactPct(out, linkBps);
            v.time_to_dry_s = timeToDryS(bufferMs == null ? NaN : bufferMs / 1000, out, linkBps);
        }
        return v;
    }

    // ── Media exponencial + decisión por muestra ────────────────────────────
    function ewma(prevBps, sampleBps, alpha) {
        const s = posInt(sampleBps);
        if (!isFinite(s)) return isFinite(Number(prevBps)) ? Math.round(Number(prevBps)) : null;
        const a = (isFinite(Number(alpha)) && Number(alpha) > 0 && Number(alpha) <= 1) ? Number(alpha) : DEFAULTS.ewmaAlpha;
        if (!isFinite(Number(prevBps)) || Number(prevBps) <= 0) return s;
        return Math.round(a * s + (1 - a) * Number(prevBps));
    }

    /**
     * Una iteración del bucle de medida (cada `requested_ms`).
     * La petición a la red (`ask_bps`) es SIEMPRE `required_bps`: la muestra no
     * la puede bajar. La muestra sólo dice HOLD o SHORTFALL y cuánto aguanta.
     */
    function decide(o) {
        const src = o || {};
        const smoothed = ewma(src.prevEwmaBps, src.sampleBps);
        const d = demand({
            outputBps: src.outputBps,
            deltaPct: src.deltaPct,
            bufferMs: src.bufferMs,
            linkBps: smoothed
        });
        return {
            ask_bps: d.required_bps,
            floor_bps: d.floor_bps,
            required_bps: d.required_bps,
            smoothed_bps: smoothed,
            action: d.feasible === true ? 'HOLD' : 'SHORTFALL',
            deficit_bps: d.feasible === true ? 0 : d.deficit_bps,
            time_to_dry_s: d.time_to_dry_s,
            sample_ms: d.sample.requested_ms,
            never_below_output: true
        };
    }

    // ── Etiqueta por canal (determinista) ──────────────────────────────────
    /**
     * Se AÑADE por canal cuando el flag está encendido. Determinista: los
     * mismos números dan exactamente la misma cadena (sin fecha, sin azar).
     */
    function tag(o) {
        const d = demand(o);
        const b = d.buffer_ms == null ? 'unknown' : String(d.buffer_ms);
        let s = TAG +
            'OUTPUT_BPS=' + (d.output_bps == null ? 'unknown' : d.output_bps) +
            ',DELTA_PCT=' + d.delta_pct +
            ',REQUIRED_BPS=' + (d.required_bps == null ? 'unknown' : d.required_bps) +
            ',EXTRA_BPS=' + (d.extra_bps == null ? 'unknown' : d.extra_bps) +
            ',RULE=INPUT_GE_OUTPUT_X_1P_DELTA' +
            ',SAMPLE_MS=' + d.sample.requested_ms +
            ',MAX_SAFE_SAMPLE_MS=' + (d.sample.max_safe_ms == null ? 'unknown' : d.sample.max_safe_ms) +
            ',MEASUREMENT_MS=' + d.sample.measurement_ms +
            ',BUFFER_MS=' + b +
            ',OUTPUT_REDUCED=false' +
            ',MEASURED_ON_DEVICE=false';
        if (d.measured_bps != null) {
            s += ',FEASIBLE=' + (d.feasible ? 'true' : 'false') +
                ',DEFICIT_BPS=' + d.deficit_bps;
        }
        return s;
    }

    /** Lee una etiqueta de vuelta (prueba de ida y vuelta). */
    function parseTag(line) {
        const s = String(line || '').trim();
        if (s.indexOf(TAG) !== 0) return null;
        const out = {};
        const body = s.slice(TAG.length);
        const parts = body.split(',');
        for (let i = 0; i < parts.length; i++) {
            const kv = parts[i].split('=');
            if (kv.length !== 2) continue;
            const k = kv[0].trim().toLowerCase();
            const raw = kv[1].trim();
            const num = Number(raw);
            out[k] = (isFinite(num) && raw !== '') ? num : raw;
        }
        return out;
    }

    // ── Catálogo de perfiles: quién entra y quién no ────────────────────────
    /** Bitrate declarado (Mbps -> bps). Devuelve NaN si no hay número: no inventa. */
    function outputBpsOf(row) {
        const r = row || {};
        const s = r.settings || r;
        const cands = [
            s.outputBps, s.output_bps,
            s.bitrate != null ? Number(s.bitrate) * 1e6 : NaN,
            s.bitrate_mbps != null ? Number(s.bitrate_mbps) * 1e6 : NaN,
            s.bandwidthKbps != null ? Number(s.bandwidthKbps) * 1000 : NaN,
            r.bitrate != null ? Number(r.bitrate) * 1e6 : NaN
        ];
        for (let i = 0; i < cands.length; i++) {
            const v = posInt(cands[i]);
            if (isFinite(v)) return v;
        }
        return NaN;
    }

    /**
     * Plan por perfil. `profiles` = [{id, settings:{bitrate}}] o el JSON del LAB.
     * Devuelve por perfil: salida, requerida, factible, delta necesario.
     * Si no hay medida de enlace, `feasible` queda null (no se inventa).
     */
    function plan(profiles, o) {
        const src = o || {};
        const list = Array.isArray(profiles) ? profiles
            : (profiles && profiles.profiles
                ? (Array.isArray(profiles.profiles) ? profiles.profiles : Object.keys(profiles.profiles).map(k => Object.assign({ id: k }, profiles.profiles[k])))
                : []);
        const rows = [];
        for (let i = 0; i < list.length; i++) {
            const p = list[i] || {};
            const out = outputBpsOf(p);
            const d = demand({ outputBps: out, deltaPct: src.deltaPct, bufferMs: src.bufferMs, linkBps: src.linkBps });
            rows.push({
                id: p.id || ('#' + i),
                output_bps: d.output_bps,
                required_bps: d.required_bps,
                delta_pct: d.delta_pct,
                feasible: d.feasible === undefined ? null : d.feasible,
                deficit_bps: d.deficit_bps === undefined ? null : d.deficit_bps,
                delta_needed_pct: d.delta_needed_pct === undefined ? null : d.delta_needed_pct,
                delta_affordable_pct: d.delta_affordable_pct === undefined ? null : d.delta_affordable_pct,
                time_to_dry_s: d.time_to_dry_s === undefined ? null : d.time_to_dry_s,
                output_known: d.output_bps != null
            });
        }
        const known = rows.filter(r => r.output_known);
        const feasible = known.filter(r => r.feasible === true);
        /* El mínimo imprescindible: el perfil más barato que SÍ entraría. */
        let minNeeded = null;
        if (known.length) {
            minNeeded = known.slice().sort((a, b) => a.required_bps - b.required_bps)[0];
        }
        return {
            version: VERSION,
            delta_pct: deltaPct(src.deltaPct),
            profiles: rows,
            profiles_count: rows.length,
            output_known: known.length,
            link_bps: isFinite(posInt(src.linkBps)) ? posInt(src.linkBps) : null,
            feasible_ids: feasible.map(r => r.id),
            feasible_count: feasible.length,
            /* Si no entra ninguno: qué haría falta como mínimo (sin inventar). */
            minimum_profile: minNeeded ? minNeeded.id : null,
            minimum_required_bps: minNeeded ? minNeeded.required_bps : null,
            shortfall_bps: (minNeeded && isFinite(posInt(src.linkBps)))
                ? Math.max(0, minNeeded.required_bps - posInt(src.linkBps)) : null,
            measured_on_device: false
        };
    }

    // ── Flag: el mismo interruptor que la capa 12P, apagado por defecto ─────
    function isOn(scope) {
        const s = scope || (typeof window !== 'undefined' ? window : null);
        if (!s) return false;
        if (s.APE_BUF_DEMAND_ON === false) return false;
        const v = s.APE_12P_MODE;
        if (v === undefined || v === null || v === false) return false;
        if (v === true) return true;
        const t = String(v).toLowerCase();
        return t === 'on' || t === '1' || t === 'true' || t === 'shadow';
    }

    /** Delta efectivo del panel (window.APE_BUF_DELTA_PCT), con defecto 10. */
    function deltaFromScope(scope) {
        const s = scope || (typeof window !== 'undefined' ? window : null);
        return deltaPct(s ? s.APE_BUF_DELTA_PCT : undefined);
    }

    // ── Autocomprobación de la regla (la que se puede medir sin player) ────
    /**
     * Invariantes de la regla. Devuelve { ok, checks:[{id, ok, detail}] }.
     * No dice nada sobre reproducción: sólo sobre la aritmética y la forma.
     */
    function validate() {
        const checks = [];
        const c = (id, ok, detail) => checks.push({ id: id, ok: !!ok, detail: String(detail) });
        c('V1 salida 15 Mbps + 20 % = 18 Mbps exactos',
            requiredBps(15000000, 20) === 18000000,
            requiredBps(15000000, 20));
        c('V2 la requerida nunca es menor que la salida',
            requiredBps(18700000, 1) >= 18700000 && requiredBps(18700000, 90) > 18700000,
            requiredBps(18700000, 1) + ' / ' + requiredBps(18700000, 90));
        c('V3 es entera (sin decimales)',
            requiredBps(1300000, 1) === 1313000 && Number.isInteger(requiredBps(1300000, 1)),
            requiredBps(1300000, 1));
        c('V4 sube con el delta',
            requiredBps(10000000, 5) < requiredBps(10000000, 10) && requiredBps(10000000, 10) < requiredBps(10000000, 20),
            requiredBps(10000000, 5) + ' < ' + requiredBps(10000000, 10) + ' < ' + requiredBps(10000000, 20));
        c('V5 delta acotado 1..90', deltaPct(0) === 10 && deltaPct(-5) === 1 && deltaPct(500) === 90, deltaPct(-5) + '/' + deltaPct(500));
        const t = tag({ outputBps: 18700000, deltaPct: 10, bufferMs: 15000 });
        const b = parseTag(t);
        c('V6 la etiqueta se lee de vuelta', b && b.output_bps === 18700000 && b.required_bps === 20570000, t.slice(0, 48) + '…');
        c('V7 determinista (misma entrada, misma cadena)',
            tag({ outputBps: 18700000, deltaPct: 10, bufferMs: 15000 }) === t, t.length);
        return { ok: checks.every(x => x.ok), checks: checks };
    }

    return {
        VERSION: VERSION,
        TAG: TAG,
        RULE: RULE,
        DEFAULTS: DEFAULTS,
        posInt: posInt,
        deltaPct: deltaPct,
        requiredBps: requiredBps,
        meets: meets,
        deltaNeededPct: deltaNeededPct,
        maxAffordableDeltaPct: maxAffordableDeltaPct,
        deltaNeededExactPct: deltaNeededExactPct,
        timeToDryS: timeToDryS,
        samplePlan: samplePlan,
        demand: demand,
        ewma: ewma,
        decide: decide,
        tag: tag,
        parseTag: parseTag,
        outputBpsOf: outputBpsOf,
        plan: plan,
        isOn: isOn,
        deltaFromScope: deltaFromScope,
        validate: validate
    };
});
