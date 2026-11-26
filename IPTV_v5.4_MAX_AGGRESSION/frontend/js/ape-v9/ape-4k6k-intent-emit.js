/* ══════════════════════════════════════════════════════════════════════════════
 * APE · INTENCIÓN 4K/6K EN LA LISTA · EMISIÓN POR CANAL
 * ------------------------------------------------------------------------------
 * QUÉ HACE
 *   Añade UNA línea de metadata por canal a la lista que produce el generador:
 *
 *     #EXT-X-APE-4K6K-INTENT:{"schema":"ape-4k-premium6k-intent/1",…}
 *
 *   Es metadata DECLARADA: no cambia el vídeo, no toca el bitrate, no reescribe
 *   ninguna URL ni ningún otro tag. El payload NO se inventa aquí: se pide al
 *   adaptador ya existente (ape-4k6k-audit-adapter.js → intentTag()), que es el
 *   dueño del esquema y del objetivo por perfil (LAB del propietario).
 *
 * POR QUÉ EXISTE ESTE FICHERO
 *   [2026-11-23 · medido] La casilla "INTENCIÓN 4K/6K EN LA LISTA" existía en el
 *   HTML y escribía window.APE_4K6K_AUDIT, pero NADIE leía ese flag al emitir:
 *   el adaptador expone intentTag()/insertIntentTag() y no había ni un punto de
 *   llamada en el generador (grep de 'insertIntentTag(' en frontend/js: solo la
 *   definición y las pruebas). Resultado: la casilla no cambiaba ni una línea de
 *   la lista. Este módulo es el punto de llamada que faltaba, y vive FUERA del
 *   generador para no reescribirlo: el generador solo lo invoca.
 *
 * DÓNDE INSERTA (y por qué no "siempre antes de la URI")
 *   insertIntentTag() del adaptador inserta inmediatamente antes de la ÚNICA línea
 *   de URI. Eso es correcto en un bloque #EXTINF→URI, pero en este emisor la línea
 *   que puede quedar pegada a la URI es un #EXT-X-STREAM-INF, y la auditoría de
 *   listas midió 22 721 pares STREAM-INF→URI que RFC 8216 §4.3.4.2 exige ADYACENTES
 *   (fue el defecto nº1 del informe: 0 de 22 721 los cumplían). Por eso aquí:
 *     · si la línea anterior a la URI es #EXT-X-STREAM-INF: → el tag va ANTES del
 *       STREAM-INF, y el par STREAM-INF→URI queda intacto;
 *     · en cualquier otro caso → antes de la URI (mismo criterio del adaptador).
 *   Con 0 o más de 1 URI en el bloque NO se toca nada: no se adivina.
 *
 * SEGUNDA INTEGRACIÓN [2026-11-23 · medida] — «TODOS LOS CANALES POR LA MISMA RUTA»
 *   Con el interruptor encendido, además del tag, este módulo GARANTIZA por
 *   construcción tres cosas por canal (antes dependían de la rama del generador):
 *     1) UNA línea #EXTVLCOPT:network-caching=… (la ruta de caché/reintento).
 *        Medido en las dos listas reales: ya salía en 15/15 (mini_15) y 6/6 (4K),
 *        porque generateChannelEntry la emite sin condición. Ahora se comprueba y,
 *        si una rama futura no la emitiera, se AÑADE aquí (nunca se duplica).
 *     2) La cadena de filtros ENTERPRISE de la muestra 4K, que es 5 filtros
 *        (zscale + hqdn3d + unsharp + gradfun + minterpolate) frente a los 3 de la
 *        ruta por canal (scale + unsharp + minterpolate). Se SUSTITUYE la línea
 *        #EXTVLCOPT:video-filter= sólo si le falta el tramo zscale=, con la cadena
 *        que el propio generador ya emite para los canales de perfil 4K: no se
 *        inventa ni un parámetro.
 *     3) La declaración #EXT-X-APE-AI-SR-ENABLED:ADAPTIVE, que la muestra 4K perdía
 *        al heredar del archivo de entrada (0 de 6 medido) y que la ruta por canal
 *        sí trae (15 de 15).
 *   Lo que esto NO hace, y hay que decirlo: no cambia el vídeo del proveedor, no
 *   sube el bitrate, no crea píxeles. Un #EXTVLCOPT es una orden para el player que
 *   lo entiende (VLC/Kodi); el resto de players la ignoran. «Calidad premium» es una
 *   instrucción declarada, no un resultado medido.
 *
 * TERCERA INTEGRACIÓN [2026-11-23 · orden del operador] — «LA .5 ES LA PREMIUM»
 *   Los 12 perfiles son P0..P5 (canónicos) + P0.5..P5.5 (6K emulados): medido en
 *   ape-profiles-config.js:5247 (APE_6K_PROFILE_IDS) y en contracts/ape_profiles_12.json
 *   («6 perfiles canonicos (P0..P5) + 6 derivados 6K emulados (P0.5..P5.5)»).
 *   Regla: a cada perfil le corresponde su versión premium, que es la .5, y la
 *   INTENCIÓN 4K/6K se declara con ESA versión, canal a canal. Con el check encendido
 *   el tag de cada canal lleva premiumOf(su perfil): P0→P0.5 … P5→P5.5; un canal que
 *   ya viene en .5 se queda en .5 (no se sube dos veces); un id desconocido o el
 *   'runtime' del adaptador NO se inventan: se declaran tal cual.
 *   Efecto medido en el arnés: el id declara la .5 y el objetivo sigue en 3840x2160
 *   porque ahí no hay APE_PROFILES_CONFIG cargado; con los 12 perfiles cargados el
 *   adaptador lee la resolución real de la .5 (5760x3240) y sube el suelo declarado.
 *
 * GARANTÍAS
 *   · flag OFF (o módulo/adaptador ausentes) ⇒ devuelve el bloque TAL CUAL, byte a
 *     byte: la lista sale idéntica a la de antes de este fichero.
 *   · idempotente: si el bloque ya trae el tag, no se duplica.
 *   · conserva el fin de línea y la ausencia de salto final (split/join).
 *   · 0 dependencias, sin DOM, sin red, sin Date.now(), sin Math.random(): el
 *     resultado depende solo de (bloque, canal, perfil, flag).
 * ══════════════════════════════════════════════════════════════════════════════ */
(function (root) {
    'use strict';
    if (!root) return;
    if (root.APE_4K6K_INTENT_EMIT) return;          /* carga única */

    var TAG = '#EXT-X-APE-4K6K-INTENT:';

    /* ── PERFIL PREMIUM: la .5 de cada perfil ─────────────────────────────── *
     * Tabla COPIADA del repo, no inventada:
     *   ape-profiles-config.js:5247  APE_6K_PROFILE_IDS = ['P0.5'…'P5.5']
     *   ape-4k6k-audit-adapter.js:69 PROFILE_IDS = P0..P5 + P0.5..P5.5 (12)
     * Las seis .5 ya se declaran a sí mismas (premiumOf('P3.5') === 'P3.5'): un
     * canal que ya viene premium no se sube dos veces. Lo que no esté en la tabla
     * se devuelve SIN TOCAR (ni 'runtime' ni un id futuro se convierten en un .5
     * que no existe). */
    var PREMIUM_OF = {
        'P0': 'P0.5', 'P1': 'P1.5', 'P2': 'P2.5', 'P3': 'P3.5', 'P4': 'P4.5', 'P5': 'P5.5',
        'P0.5': 'P0.5', 'P1.5': 'P1.5', 'P2.5': 'P2.5',
        'P3.5': 'P3.5', 'P4.5': 'P4.5', 'P5.5': 'P5.5'
    };

    /* Devuelve el id premium (.5) que corresponde a un perfil. Puro: sin flag,
     * sin DOM y sin estado; la decisión de usarlo la toma applyDetailed(). */
    function premiumOf(pid) {
        var k = (pid === undefined || pid === null) ? '' : String(pid).trim().toUpperCase();
        if (k === '') return pid;
        return PREMIUM_OF[k] || pid;
    }

    /* ── Las tres garantías del interruptor (ver cabecera) ─────────────────── *
     * Las tres cadenas son COPIADAS de la lista real que produce el generador,
     * no escritas a mano:
     *   CACHING_LINE     = lo que emite generateChannelEntry (medido mini_15: 15/15).
     *   ENTERPRISE_FILTER= la línea de filtros de la muestra 4K (medido: 6/6), 5 filtros.
     *   AI_SR_LINE       = lo que trae la ruta por canal (medido mini_15: 15/15) y
     *                      que la muestra 4K pierde al heredar del archivo (0/6). */
    var CACHING_PREFIX = '#EXTVLCOPT:network-caching=';
    var CACHING_LINE = '#EXTVLCOPT:network-caching=30000';
    var FILTER_PREFIX = '#EXTVLCOPT:video-filter=';
    var ENTERPRISE_FILTER = '#EXTVLCOPT:video-filter=zscale=transfer=bt1886:matrix=bt709:primaries=bt709:range=limited:w=3840:h=2160:filter=lanczos,hqdn3d=2:1.5:6:4.5,unsharp=lx=5:ly=5:la=0.6:cx=3:cy=3:ca=0.2,gradfun=radius=8:strength=0.3,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=5';
    var AI_SR_LINE = '#EXT-X-APE-AI-SR-ENABLED:ADAPTIVE';

    /* ── ¿Encendido? ──────────────────────────────────────────────────────── *
     * `explicit` permite pedirlo por opción de ESTA generación sin depender del
     * global (y apagarlo aunque el global esté encendido). Sin `explicit`, manda
     * el global, con la misma lectura que hace el adaptador (isEnabled()). */
    function isOn(explicit) {
        if (explicit === true) return true;
        if (explicit === false) return false;
        var ad = root.APE_4K6K;
        if (ad && typeof ad.isEnabled === 'function') {
            try { return ad.isEnabled() === true; } catch (_) { return false; }
        }
        var raw = root.APE_4K6K_AUDIT;
        if (raw === true || raw === 1) return true;
        if (raw === undefined || raw === null || raw === false || raw === 0) return false;
        var s = String(raw).trim().toLowerCase();
        return s === '1' || s === 'true' || s === 'on' || s === 'yes';
    }

    /* ── Colocación pura ──────────────────────────────────────────────────── *
     * Devuelve { block, at, where }: `at` es el índice donde entró el tag (-1 si
     * no se tocó nada) y `where` dice el criterio aplicado, para poder afirmarlo
     * en una prueba sin adivinarlo. */
    function place(block, tagLine) {
        if (typeof block !== 'string' || block === '') return { block: block, at: -1, where: 'bloque vacio o no-string' };
        if (typeof tagLine !== 'string' || tagLine.indexOf(TAG) !== 0) return { block: block, at: -1, where: 'tag no valido' };
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
        if (/^#EXT-X-STREAM-INF:/i.test(prev)) at = idx - 1;    /* adyacencia §4.3.4.2 */
        lines.splice(at, 0, tagLine);
        return { block: lines.join(eol), at: at, where: at === idx ? 'antes de la URI' : 'antes del STREAM-INF' };
    }

    /* ── Refuerzo puro, sin flag: aplica las tres garantías al bloque ─────── *
     * Devuelve { block, changes } donde `changes` es una lista legible de lo que
     * se tocó (vacía si el bloque ya cumplía). No mira el flag: la decisión la
     * toma apply(). No añade nada si el bloque no es una cadena con líneas. */
    function enforce(block) {
        var changes = [];
        if (typeof block !== 'string' || block === '') return { block: block, changes: changes };
        var eol = block.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
        var lines = block.split(eol);

        function cuantas(prefix) {
            var n = 0;
            for (var k = 0; k < lines.length; k++) if (lines[k].indexOf(prefix) === 0) n++;
            return n;
        }
        function primero(prefix) {
            for (var k = 0; k < lines.length; k++) if (lines[k].indexOf(prefix) === 0) return k;
            return -1;
        }
        /* Dónde meter una línea nueva: la MISMA regla que place(), porque si no se
         * rompe la adyacencia STREAM-INF → URI que exige RFC 8216 §4.3.4.2 (ese
         * fue el defecto D2: 22 721 canales con el par separado). Si la única URI
         * viene justo después de un #EXT-X-STREAM-INF, se inserta ANTES del
         * STREAM-INF; si el bloque no tiene exactamente una URI reconocible, al
         * final: no es un bloque de canal y no se adivina dónde va. */
        function antesDeUri() {
            var idx = -1, n = 0, k;
            for (k = 0; k < lines.length; k++) {
                if (/^\s*https?:\/\//i.test(lines[k])) { n++; idx = k; }
            }
            if (n !== 1) return lines.length;
            var prev = idx > 0 ? String(lines[idx - 1]).replace(/^\s+/, '') : '';
            return /^#EXT-X-STREAM-INF:/i.test(prev) ? idx - 1 : idx;
        }

        /* (2) Cadena de filtros enterprise — primero, porque decide dónde caen las otras. */
        var nFil = cuantas(FILTER_PREFIX);
        if (nFil === 1) {
            var iFil = primero(FILTER_PREFIX);
            if (lines[iFil].indexOf('zscale=') < 0) {
                lines[iFil] = ENTERPRISE_FILTER;
                changes.push('filtros 4K aplicados (3 -> 5 filtros)');
            }
        } else if (nFil === 0) {
            lines.splice(antesDeUri(), 0, ENTERPRISE_FILTER);
            changes.push('filtros 4K añadidos (no había ninguno)');
        } else {
            changes.push('filtros: ' + nFil + ' líneas video-filter, no se toca (ambiguo)');
        }

        /* (1) Ruta de caché: al menos una, nunca duplicada por nosotros. */
        if (cuantas(CACHING_PREFIX) === 0) {
            var iF2 = primero(FILTER_PREFIX);
            var at = iF2 >= 0 ? iF2 : antesDeUri();
            lines.splice(at, 0, CACHING_LINE);
            changes.push('network-caching añadido (' + CACHING_LINE.slice(CACHING_PREFIX.length) + ')');
        }

        /* (3) Declaración de superresolución: la que la muestra 4K perdía. */
        if (cuantas('#EXT-X-APE-AI-SR-ENABLED:') === 0) {
            var iF3 = primero(FILTER_PREFIX);
            var at3 = iF3 >= 0 ? iF3 + 1 : antesDeUri();
            lines.splice(at3, 0, AI_SR_LINE);
            changes.push('AI-SR declarado');
        }

        return { block: lines.join(eol), changes: changes };
    }

    /* ── Punto de llamada del generador ───────────────────────────────────── *
     * apply(bloqueDelCanal, canal, perfilEmitido, explicitOn) → bloque.
     * Con el flag apagado devuelve el MISMO string (identidad comprobada). */
    function apply(block, ch, profile, explicitOn) {
        /* UNA sola implementación: apply() es applyDetailed() sin el informe, para
         * que no existan dos caminos que puedan divergir. */
        return applyDetailed(block, ch, profile, explicitOn).block;
    }

    /* ── Variante con informe, para poder AFIRMAR qué hizo ─────────────────── *
     * Devuelve { block, changes, at, where }. apply() es esta misma función sin
     * el informe, así que no hay dos comportamientos que puedan divergir. */
    function applyDetailed(block, ch, profile, explicitOn) {
        var out = { block: block, changes: [], at: -1, where: 'flag apagado', profileOwn: profile, profilePremium: profile };
        if (typeof block !== 'string' || block === '') return out;
        if (!isOn(explicitOn)) return out;
        var enf = enforce(block);
        out.block = enf.block;
        out.changes = enf.changes;
        out.where = 'garantías aplicadas';
        var ad = root.APE_4K6K;
        if (!ad || typeof ad.intentTag !== 'function') { out.where = 'sin adaptador'; return out; }
        /* [2026-11-23 · PREMIUM .5] El tag se declara con la versión premium del
         * perfil del canal, no con la base: P0→P0.5 … P5→P5.5. Un canal que ya
         * viene en .5 se queda igual; 'runtime' o un id raro se declaran tal cual
         * (premiumOf lo devuelve sin tocar). Las garantías de arriba no dependen
         * de esto, así que un perfil raro no pierde caching, filtros ni AI-SR. */
        var prem = premiumOf(profile);
        out.profilePremium = prem;
        var chForTag = { ape_profile: String(prem || '') };
        try {
            var prev = ad.INTENT_FIELD && ch ? ch[ad.INTENT_FIELD] : null;
            /* Se reaprovecha un payload previo SÓLO si ya declara esta misma
             * premium; si declaraba la base (P3), se deja que el adaptador lo
             * reconstruya, o el tag seguiría diciendo P3 y la regla no se cumpliría. */
            if (prev && String(((prev.outputPolicy || {}).profile) || '').toUpperCase() === String(prem || '').toUpperCase()) {
                chForTag[ad.INTENT_FIELD] = prev;
            }
        } catch (_) { /* igual que apply */ }
        var tag;
        try { tag = ad.intentTag(chForTag); } catch (_) { out.where = 'adaptador lanzó'; return out; }
        if (typeof tag !== 'string' || tag.indexOf(TAG) !== 0) { out.where = 'tag no válido'; return out; }
        var pl = place(out.block, tag);
        out.block = pl.block; out.at = pl.at; out.where = pl.where;
        return out;
    }

    root.APE_4K6K_INTENT_EMIT = {
        version: '1.2.0',
        TAG: TAG,
        CACHING_LINE: CACHING_LINE,
        ENTERPRISE_FILTER: ENTERPRISE_FILTER,
        AI_SR_LINE: AI_SR_LINE,
        PREMIUM_OF: PREMIUM_OF,
        premiumOf: premiumOf,
        isOn: isOn,
        place: place,
        enforce: enforce,
        apply: apply,
        applyDetailed: applyDetailed
    };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
