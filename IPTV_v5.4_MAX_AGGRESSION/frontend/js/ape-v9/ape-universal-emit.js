/* ════════════════════════════════════════════════════════════════════════════
 * js/ape-v9/ape-universal-emit.js · v1.0.0
 * ---------------------------------------------------------------------------
 * MODO UNIVERSAL · la lista que emite el generador se declara a sí misma.
 *
 * QUÉ ES
 *   Un emisor PURO (sin DOM, sin red, sin reloj, 0 dependencias) que añade UNA
 *   línea declarativa por canal cuando el interruptor está encendido:
 *
 *     #EXT-X-APE-UNIVERSAL:V=1,DIALECTS=12,KEEP_UNKNOWN=true,KEEP_APE=true,
 *                          SANITIZE_TOXIC=true,GUIDE=12P_CANONICAL/1,PROFILE=P3
 *
 *   Con esa línea, cualquier consumidor (el multiparser de la app, o un script
 *   propio) sabe sin adivinar: cuántos dialectos de player cubre la lista, que
 *   los tags desconocidos y los #EXT-X-APE-* se conservan en universal.m3u8,
 *   que las cabeceras tóxicas se limpian al exportar, y qué guía canónica se
 *   siguió al construirla (el contrato 12P de la muestra + el LAB v9.3).
 *
 * QUÉ NO ES
 *   · No traduce dialectos: eso lo hace js/ape-v9/ape-multi-parser.js, que ya
 *     está cargado y expone render(model, dialecto) y DIALECT_DEFS. Aquí sólo
 *     se DECLARA, no se reescribe la lista.
 *   · No cambia el vídeo, ni el bitrate, ni las URLs, ni el orden de nada.
 *   · No inventa cifras: DIALECTS sale de la tabla copiada del multiparser (y
 *     una prueba comprueba que sigue coincidiendo con su DIALECT_DEFS real), y
 *     GUIDE sale del contrato 12P ya implementado en lab-12p-conformance.js
 *     (otra prueba compara techo por techo y envelope por envelope).
 *
 * POR QUÉ APAGADO ES SAGRADO
 *   El generador llama a apply() en un solo sitio, junto a generateChannelEntry.
 *   Con el flag apagado apply() devuelve el MISMO string (identidad), así que la
 *   lista sale byte a byte como antes. Eso no se supone: se mide en la suite
 *   frontend/tests/ape-universal-emit.test.js con la fixture real mini_15.
 *
 * DÓNDE ENTRA LA LÍNEA
 *   Antes de la URI del canal y, si esa URI va precedida de #EXT-X-STREAM-INF,
 *   antes del STREAM-INF: la adyacencia STREAM-INF → URI de RFC 8216 §4.3.4.2
 *   se respeta siempre (romperla ya costó 22 721 canales en este repo).
 *   Si el bloque no tiene exactamente 1 URI, no se toca: no se adivina.
 * ════════════════════════════════════════════════════════════════════════════ */
(function (root) {
    'use strict';
    if (!root) return;

    var VERSION = '1.0.0';
    var TAG = '#EXT-X-APE-UNIVERSAL';

    /* ── Los dialectos que cubre la lista ──────────────────────────────────── *
     * COPIADOS de DIALECT_DEFS en js/ape-v9/ape-multi-parser.js (línea 978), no
     * escritos a mano: la suite A2 compara esta lista con la del multiparser y
     * falla si alguien añade o quita un dialecto en un sitio y no en el otro. */
    var DIALECTS = [
        'universal', 'vlc', 'kodi', 'tivimate', 'ott', 'smarters',
        'exoplayer', 'apple', 'ffmpeg', 'mpv', 'hlsjs', 'generic'
    ];

    /* ── La guía canónica que la línea declara ─────────────────────────────── *
     * Mismos valores que implementa js/ape-v9/lab-12p-conformance.js, que a su
     * vez los toma del LAB CALIBRATED BULLETPROOF y lo confirma la muestra 12P
     * (PROFILE_MATRIX_12P.csv / METADATA_12P.json). La suite A3 los compara con
     * el módulo 12P cargado: si alguien cambia un techo allí, aquí se ve. */
    var GUIDE = {
        id: '12P_CANONICAL',
        version: 1,
        profiles: 12,
        caps: [
            { bitrate_max_mbps: 25, cap_s: 30 },
            { bitrate_max_mbps: 80, cap_s: 24 },
            { bitrate_max_mbps: 150, cap_s: 20 },
            { bitrate_max_mbps: null, cap_s: 15 }
        ],
        envelope: [0.625, 2, 1.25, 3.75],
        prefetch_rule: 'min(6,max(2,round(T/4)))',
        parallel_downloads: 4,
        declared_retained: true
    };

    /* ── ¿Encendido? ──────────────────────────────────────────────────────── *
     * `explicit` permite decidirlo por generación (options.universal) y gana al
     * global, incluso para APAGARLO. Sin `explicit` manda window.APE_UNIVERSAL_MODE
     * (lo escribe la casilla del panel, que además lo guarda en localStorage).
     * Un valor ausente/null/false/0/'off' es APAGADO: el defecto es la lista de
     * siempre, nunca al revés. */
    function isOn(explicit) {
        if (explicit === true) return true;
        if (explicit === false) return false;
        var raw = root.APE_UNIVERSAL_MODE;
        if (raw === true || raw === 1) return true;
        if (raw === undefined || raw === null || raw === false || raw === 0) return false;
        var s = String(raw).trim().toLowerCase();
        return s === '1' || s === 'true' || s === 'on' || s === 'yes';
    }

    /* ── Un valor de atributo, saneado ────────────────────────────────────── *
     * El perfil entra en la línea como atributo: sin comas ni dos puntos, que
     * romperían la lista de atributos. Cadena vacía → 'runtime' (que es lo que
     * el generador usa cuando no hay perfil), nunca un valor inventado. */
    function attrValue(v) {
        var s = (v === undefined || v === null) ? '' : String(v).trim();
        if (s === '') return 'runtime';
        return s.replace(/[^A-Za-z0-9._\-]/g, '').slice(0, 32) || 'runtime';
    }

    /* ── La línea que se emite ────────────────────────────────────────────── *
     * Orden de atributos FIJO (A4 lo comprueba literal): así dos corridas dan
     * el mismo texto y el SHA de la lista sigue siendo determinista. */
    function declare(profile) {
        return TAG +
            ':V=' + GUIDE.version +
            ',DIALECTS=' + DIALECTS.length +
            ',KEEP_UNKNOWN=true' +
            ',KEEP_APE=true' +
            ',SANITIZE_TOXIC=true' +
            ',GUIDE=' + GUIDE.id + '/' + GUIDE.version +
            ',PROFILE=' + attrValue(profile);
    }

    /* ── Colocación pura ──────────────────────────────────────────────────── *
     * Devuelve { block, at, where }. `at` es el índice donde entró la línea (-1
     * si no se tocó) y `where` el criterio aplicado, para poder AFIRMARLO en
     * una prueba en vez de suponerlo. Respeta el fin de línea del bloque. */
    function place(block, line) {
        if (typeof block !== 'string' || block === '') return { block: block, at: -1, where: 'bloque vacio o no-string' };
        if (typeof line !== 'string' || line.indexOf(TAG) !== 0) return { block: block, at: -1, where: 'linea no valida' };
        if (block.indexOf(TAG) >= 0) return { block: block, at: -1, where: 'ya presente' };
        var eol = block.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
        var lines = block.split(eol);
        var idx = -1, n = 0, i;
        for (i = 0; i < lines.length; i++) {
            if (/^\s*https?:\/\//i.test(lines[i])) { n++; idx = i; }
        }
        if (n !== 1) return { block: block, at: -1, where: 'ambigua: ' + n + ' URI' };
        var at = idx;
        var prev = idx > 0 ? String(lines[idx - 1]).replace(/^\s+/, '') : '';
        if (/^#EXT-X-STREAM-INF:/i.test(prev)) at = idx - 1;    /* RFC 8216 §4.3.4.2 */
        lines.splice(at, 0, line);
        return { block: lines.join(eol), at: at, where: at === idx ? 'antes de la URI' : 'antes del STREAM-INF' };
    }

    /* ── Punto de llamada del generador, con informe ───────────────────────── *
     * apply() es esta misma función sin el informe: no hay dos caminos que
     * puedan divergir. Con el flag apagado sale antes de tocar nada. */
    function applyDetailed(block, ch, profile, explicitOn) {
        var out = { block: block, changes: [], at: -1, where: 'flag apagado', tag: null };
        if (typeof block !== 'string' || block === '') { out.where = 'bloque vacio o no-string'; return out; }
        if (!isOn(explicitOn)) return out;
        var line = declare(profile);
        var pl = place(block, line);
        out.block = pl.block;
        out.at = pl.at;
        out.tag = line;
        out.where = pl.where;
        if (pl.at >= 0) out.changes.push('declaracion universal añadida (' + pl.where + ')');
        return out;
    }

    function apply(block, ch, profile, explicitOn) {
        return applyDetailed(block, ch, profile, explicitOn).block;
    }

    /* ── Resumen legible de la guía, para el panel y para la prueba ────────── *
     * Todo derivado de GUIDE; no hay ningún número escrito fuera de él. */
    function guideSummary() {
        var caps = GUIDE.caps.map(function (c) {
            return (c.bitrate_max_mbps === null ? 'resto' : c.bitrate_max_mbps + ' Mbps') + '→' + c.cap_s + ' s';
        }).join(' / ');
        return {
            id: GUIDE.id + '/' + GUIDE.version,
            dialects: DIALECTS.length,
            profiles: GUIDE.profiles,
            caps: caps,
            envelope: GUIDE.envelope.join('/') + ' ·T',
            prefetch: GUIDE.prefetch_rule,
            parallel_downloads: GUIDE.parallel_downloads,
            declared_retained: GUIDE.declared_retained
        };
    }

    root.APE_UNIVERSAL_EMIT = {
        version: VERSION,
        VERSION: VERSION,
        TAG: TAG,
        DIALECTS: DIALECTS,
        GUIDE: GUIDE,
        isOn: isOn,
        attrValue: attrValue,
        declare: declare,
        place: place,
        apply: apply,
        applyDetailed: applyDetailed,
        guideSummary: guideSummary
    };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
