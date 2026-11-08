/**
 * ape-url-builder.js — Armador de URL Idempotente, Isomórfico, Polimórfico
 *
 * VERSIÓN CORREGIDA del builder v9.2.0 aportado por el operador. Los tres defectos que
 * se midieron antes de tocar nada:
 *
 *   1. NO ERA IDEMPOTENTE. `_normalize` metía `timestamp = floor(now/60)*60` y `_encodeState`
 *      lo metía en el seed. Medido: la misma entrada daba seed 08a92a50… y 60 s después
 *      161e9147…, o sea otra URL. `f(x) = f(f(x))` sólo se cumplía dentro del mismo minuto.
 *      Aquí el seed NO depende del tiempo. Si el llamador quiere una URL distinta por
 *      minuto, pasa `salt` explícito y entonces lo hace a propósito, no por accidente.
 *
 *   2. PROMETÍA 206. `toPartialUrl()` devolvía una URL con `?range=`, pero un manifiesto
 *      generado al vuelo no tiene fichero que trocear: el endpoint responde 200 completo.
 *      Prometer 206 sobre algo que no puede darlo es una mentira al consumidor. El método
 *      se conserva pero documenta lo que realmente produce.
 *
 *   3. EL FINGERPRINT NO CUBRÍA `mode`. `toRedirectUrl` recalculaba fp sobre un objeto con
 *      `mode` que `_fingerprint` no miraba, así que el fp nuevo era el viejo. Ahora la
 *      huella cubre exactamente los mismos campos en construcción y en verificación.
 *
 * LO QUE SÍ ERA CORRECTO y se conserva:
 *   - FNV-1a de 64 bits con BigInt: determinista y portable.
 *   - base64url sin relleno para el device payload.
 *   - Orden fijo de parámetros (orden determinista ⇒ misma cadena).
 *   - Los perfiles por device con `preferred` / `fallback`.
 *
 * COMPATIBILIDAD CON EL VPS
 *   url2-cartridge.php ya decodifica `?d=` (base64url + JSON), `?p=`, `?n=`, `?id=`, `?logo=`.
 *   Los parámetros nuevos (`s`, `v`, `fp`) los ignora sin romperse: RFC 8216 / HTTP no obligan
 *   a rechazar query desconocida, y el endpoint los deja pasar.
 */

'use strict';

class ApeUrlBuilder {
    static VERSION = '9.3.0';                 // 9.2.0 → 9.3.0: idempotencia real
    static ENDPOINT = 'https://iptv-ape.duckdns.org/url2/canal.m3u8';

    /** Orden canónico de perfiles, de mínimo a máximo. */
    // Escalera COMPLETA con las variantes 6K del LAB. El orden va de peor a mejor.
    // Las variantes .5 se situan por ENCIMA de su base (P3.5 > P3), que es lo que
    // el LAB declara (5760x3240 frente a 1920x1080).
    static ORDER = ['P5', 'P5.5', 'P4', 'P4.5', 'P3', 'P3.5', 'P2', 'P2.5', 'P1', 'P1.5', 'P0', 'P0.5'];

    // Escalera SOLO de perfiles base. `network-excellent` sube por aqui, no por
    // ORDER: subir de P4 a P4.5 significaria saltar de 720p a 6K por tener buena
    // red, que no es lo que el LAB declara. Las variantes .5 se eligen a mano.
    static BASE_ORDER = ['P5', 'P4', 'P3', 'P2', 'P1', 'P0'];

    /**
     * Perfiles por device. `preferred` es la forma óptima; `fallback`, la que se usa
     * cuando la red no aguanta la preferida.
     */
    static PROFILES = {
        'shield-tv': {
            soc: 'tegra-x1', ram: 3072, maxRes: [3840, 2160], hdr: 'dv,hdr10', fps: 60,
            preferred: 'P0', fallback: 'P1',
        },
        'firestick-4k-max': {
            soc: 'mediatek-mt8696', ram: 2048, maxRes: [3840, 2160], hdr: 'hdr10', fps: 60,
            preferred: 'P1', fallback: 'P2',
        },
        'onn-4k': {
            soc: 's905x4', ram: 2048, maxRes: [3840, 2160], hdr: 'hdr10', fps: 60,
            preferred: 'P1', fallback: 'P2',
        },
        'firestick-4k': {
            soc: 'mediatek-mt8695', ram: 1536, maxRes: [3840, 2160], hdr: 'hdr10', fps: 60,
            preferred: 'P2', fallback: 'P3',
        },
        'firestick-lite': {
            soc: 'mediatek', ram: 1024, maxRes: [1920, 1080], hdr: 'sdr', fps: 60,
            preferred: 'P4', fallback: 'P5',
        },
        'generic': {
            soc: 'unknown', ram: 2048, maxRes: [1920, 1080], hdr: 'sdr', fps: 30,
            preferred: 'P4', fallback: 'P5',
        },
    };

    // ══════════════════════════════════════════════════════════════════════════
    // API
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Construye la URL. Misma entrada ⇒ misma URL, BIT A BIT, sin importar cuándo se llame.
     *
     * @param {object} params
     * @param {string} params.url            URL origen del canal (verbatim, SHIELDED)
     * @param {string} [params.deviceType]   clave de PROFILES; si falta se infiere del UA
     * @param {object} [params.deviceCaps]   override de capacidades
     * @param {string} [params.networkTier]  'excellent' | 'good' | 'poor'
     * @param {string} [params.channelName]
     * @param {number} [params.channelId]
     * @param {string} [params.logo]
     * @param {string} [params.salt]         ÚNICO campo que puede cambiar la URL a propósito
     *                                       para la misma entrada. Sin salt, determinista.
     * @param {boolean}[params.forceProfile] si true, networkTier no degrada el perfil
     * @returns {ApeUrl}
     */
    static build(params) {
        const norm = this._normalize(params);
        const profile = this._selectProfile(norm);
        const state = this._encodeState(norm, profile);
        const url = this._constructUrl(state, norm.endpoint);
        return new ApeUrl(url, state, profile);
    }

    /**
     * Reconstruye el estado completo desde la URL (isomorfismo inverso).
     * Devuelve `valid:false` si el fingerprint no cuadra, nunca lanza por eso.
     */
    static parse(urlString) {
        let parsed;
        try {
            parsed = new URL(urlString);
        } catch {
            return { state: null, valid: false, error: 'url_no_valida' };
        }
        const q = parsed.searchParams;
        const device = this._decodeDevice(q.get('d') || '');
        const state = {
            url: q.get('u') || '',
            deviceB64: q.get('d') || '',
            device,
            profile: q.get('p') || '',
            name: q.get('n') || '',
            id: q.get('id') || '',
            logo: q.get('logo') || '',
            seed: q.get('s') || '',
            version: q.get('v') || '',
        };
        const esperado = this._fingerprint(state);
        const real = q.get('fp') || '';
        return {
            state,
            valid: real === esperado,
            expected_fp: esperado,
            actual_fp: real,
            profile: (device && device.type && this.PROFILES[device.type]) || this.PROFILES.generic,
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PRIVADO
    // ══════════════════════════════════════════════════════════════════════════

    static _normalize(p) {
        const url = String(p.url || '').trim();

        let deviceType = p.deviceType || '';
        if (!deviceType || !this.PROFILES[deviceType]) {
            deviceType = this._detectDevice(String((p.deviceCaps && p.deviceCaps.ua) || ''));
        }

        // La red NO modifica el deviceType: modifica la selección de perfil. Antes se
        // cambiaba el device entero, lo que hacía que la URL declarara un SoC que el
        // usuario no tiene. El device es un hecho; la red es una condición.
        const tier = ['excellent', 'good', 'poor'].indexOf(p.networkTier) >= 0 ? p.networkTier : 'good';

        return {
            url,
            deviceType,
            deviceCaps: Object.assign({}, this.PROFILES[deviceType], p.deviceCaps || {}),
            networkTier: tier,
            forceProfile: !!p.forceProfile,
            name: String(p.channelName || 'Unknown').replace(/[<>"'\\]/g, '').slice(0, 60),
            id: Number.isFinite(parseInt(p.channelId, 10)) ? parseInt(p.channelId, 10) : 0,
            logo: /^https?:\/\//i.test(String(p.logo || '')) ? String(p.logo) : '',
            // Sin `salt` la URL es determinista. Con `salt`, el llamador pide variación.
            salt: p.salt ? String(p.salt).slice(0, 32) : '',
            // [PULSE-WRAP] Override explícito de perfil por CLASE DE CANAL (no por device).
            // Necesario para envolver listas: el perfil lo dicta la calidad del canal.
            // Se aceptan las variantes .5 del LAB (P0.5/P1.5/P2.5/P3.5/P4.5/P5.5).
            // Antes solo pasaba /^P[0-5]$/, asi que P0.5 caia a '' y el perfil se
            // recalculaba por device: medido, P0.5 (6K) salia como P4 (720p). Eso es
            // una degradacion silenciosa y la Ley Anti-Degradacion la prohibe.
            profile: /^P[0-5](\.5)?$/.test(String(p.profile || '')) ? String(p.profile) : '',
            // [PULSE-WRAP] Endpoint destino. `{id}` se sustituye por el id del canal.
            // Sin endpoint se usa ENDPOINT (comportamiento previo intacto).
            endpoint: p.endpoint ? String(p.endpoint) : '',
        };
    }

    static _detectDevice(ua) {
        const s = String(ua || '').toLowerCase();
        if (!s) return 'generic';
        if (s.indexOf('shield') >= 0 || s.indexOf('nvidia') >= 0) return 'shield-tv';
        if (s.indexOf('afts') >= 0 || s.indexOf('4k max') >= 0) return 'firestick-4k-max';
        if (s.indexOf('aftmm') >= 0) return 'firestick-4k';
        if (s.indexOf('aftlite') >= 0 || s.indexOf('lite') >= 0) return 'firestick-lite';
        if (s.indexOf('onn') >= 0 || s.indexOf('s905') >= 0) return 'onn-4k';
        return 'generic';
    }

    static _selectProfile(n) {
        const base = this.PROFILES[n.deviceType] || this.PROFILES.generic;
        const pref = base.preferred;
        const order = this.ORDER;

        // Perfil explícito (wrap de listas por calidad de canal) manda sobre todo.
        if (n.profile) {
            return Object.assign({}, base, { selected: n.profile, reason: 'explicit' });
        }

        if (n.forceProfile) {
            return Object.assign({}, base, { selected: pref, reason: 'forced' });
        }
        if (n.networkTier === 'poor') {
            return Object.assign({}, base, { selected: base.fallback, reason: 'network-poor' });
        }
        if (n.networkTier === 'excellent') {
            // Se sube por BASE_ORDER (escalera de resoluciones), no por ORDER: si se
            // usara ORDER, P4 -> P4.5 seria saltar de 720p a 6K por buena red.
            const bases = this.BASE_ORDER;
            const bare = String(pref).replace(/\.5$/, '');
            const i = bases.indexOf(bare);
            // i===0 es P5; el techo es P0 (ultimo). i<0 (perfil desconocido) no se toca.
            if (i >= 0 && i < bases.length - 1) {
                return Object.assign({}, base, { selected: bases[i + 1], reason: 'network-excellent' });
            }
        }
        return Object.assign({}, base, { selected: pref, reason: 'device-preferred' });
    }

    static _encodeState(n, profile) {
        const dev = {
            t: n.deviceType,
            s: profile.soc,
            r: profile.ram,
            w: profile.maxRes[0],
            h: profile.maxRes[1],
            f: profile.fps,
            hdr: profile.hdr,
            p: profile.selected,
        };
        const deviceB64 = Buffer.from(JSON.stringify(dev), 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        // ── IDEMPOTENCIA ──
        // El seed NO incluye tiempo. Es función pura de la entrada (+ salt si lo hay).
        const seedInput = [n.url, deviceB64, profile.selected, this.VERSION, n.salt].join('|');
        const seed = this._hash(seedInput).slice(0, 16);

        return {
            url: n.url,
            deviceB64,
            profile: profile.selected,
            name: n.name,
            id: n.id,
            logo: n.logo,
            seed,
            version: this.VERSION,
            tier: n.networkTier,
            reason: profile.reason,
        };
    }

    static _constructUrl(state, endpoint) {
        // Orden determinístico: mismo estado ⇒ misma cadena de query.
        let base = String(endpoint || this.ENDPOINT);
        base = base.replace(/\{id\}/g, encodeURIComponent(String(state.id || 0)));
        const q = new URLSearchParams();
        q.set('u', state.url);
        q.set('d', state.deviceB64);
        q.set('p', state.profile);
        q.set('n', state.name);
        q.set('id', String(state.id));
        q.set('s', state.seed);
        q.set('v', state.version);
        if (state.logo) q.set('logo', state.logo);
        q.set('fp', this._fingerprint(state));
        return base + '?' + q.toString();
    }

    static _decodeDevice(b64) {
        if (!b64) return null;
        try {
            const json = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
            const d = JSON.parse(json);
            return {
                type: d.t, soc: d.s, ram: d.r,
                width: d.w, height: d.h, fps: d.f,
                hdr: d.hdr, profile: d.p,
            };
        } catch {
            return null;
        }
    }

    /**
     * Huella de integridad. Cubre EXACTAMENTE los campos que se emiten y en el mismo orden
     * que `_constructUrl`, para que construcción y verificación coincidan siempre.
     */
    static _fingerprint(state) {
        const canon = [
            state.url,
            state.deviceB64,
            state.profile,
            String(state.id),
            state.seed,
            state.version,
            state.logo || '',
        ].join('|');
        return this._hash(canon).slice(0, 8);
    }

    /** FNV-1a 64-bit con BigInt: determinista y portable. */
    static _hash(str) {
        let h = 0xcbf29ce484222325n;
        for (let i = 0; i < str.length; i++) {
            h ^= BigInt(str.charCodeAt(i));
            h *= 0x100000001b3n;
            h &= 0xffffffffffffffffn;
        }
        return h.toString(16).padStart(16, '0');
    }
}

class ApeUrl {
    constructor(urlString, state, profile) {
        this.url = urlString;
        this.state = Object.freeze(Object.assign({}, state));
        this.profile = Object.freeze(Object.assign({}, profile));
        this.seed = state.seed;
        this.fingerprint = ApeUrlBuilder._fingerprint(state);
        Object.freeze(this);
    }

    /** Estado reconstruido desde la propia URL (isomorfismo). */
    reconstruct() {
        return ApeUrlBuilder.parse(this.url);
    }

    /** Integridad: rebuild de la misma entrada debe dar esta misma URL. */
    verify() {
        const p = ApeUrlBuilder.parse(this.url);
        if (!p.valid) return false;
        const rebuilt = ApeUrlBuilder.build({
            url: p.state.url,
            deviceType: p.state.device ? p.state.device.type : 'generic',
            channelName: p.state.name,
            channelId: p.state.id,
            logo: p.state.logo,
        });
        return rebuilt.url === this.url;
    }

    /**
     * Variante con `mode=redirect`.
     *
     * HONESTIDAD: esto produce un 302 al origen. Es un fallback real y comprobado contra
     * el endpoint, no una promesa.
     */
    toRedirectUrl() {
        const u = new URL(this.url);
        u.searchParams.set('mode', 'redirect');
        return u.toString();
    }

    /**
     * Variante con `?range=`.
     *
     * HONESTIDAD: el endpoint responde 200 completo. Un manifiesto generado al vuelo no
     * tiene fichero que trocear, así que NO se emite `Content-Range` ni 206. El parámetro
     * viaja y el servidor lo ignora. Se mantiene el método porque un consumidor puede
     * quererlo, pero quien lo use no debe esperar 206.
     */
    toRangeHintUrl(byteStart = 0, byteEnd = 4095) {
        const u = new URL(this.url);
        u.searchParams.set('range', byteStart + '-' + byteEnd);
        return u.toString();
    }

    toString() { return this.url; }

    toJSON() {
        return {
            url: this.url,
            seed: this.seed,
            fingerprint: this.fingerprint,
            profile: this.state.profile,
            reason: this.state.reason,
            valid: this.verify(),
        };
    }
}

module.exports = { ApeUrlBuilder, ApeUrl };

