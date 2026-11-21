/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE_SERVER_PROFILES — PERFILES MEDIDOS, GENERADO. NO EDITAR A MANO.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Deja el store de APE_SERVER_PROFILE en window.APE_SERVER_PROFILES_STORE para
 * que generation-controller lo pase al generador como options.server_profile.
 *
 * Generado por: tools/lab/profile_to_data_js.js
 * Fuente      : ape-server-profiles.json
 * Generado    : 2026-11-06T14:13:08.323Z
 * Medido desde: 2026-11-06T13:59:08.466Z   (la medicion mas antigua)
 * Medido hasta: 2026-11-06T13:59:10.584Z   (la mas reciente)
 * TTL         : 6 h  (pasado el TTL estos datos son una
 *               FOTO, no una medicion viva: re-correr profile_run.js y regenerar)
 * Servidores  : 2
 *
 * Para actualizar: node tools/lab/profile_run.js --servers <muestra> --out profile.json
 *                  node tools/lab/profile_to_data_js.js --in profile.json --out <destino>
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root) {
    'use strict';
    var STORE = {
        "moduleVersion": "1.0.0",
        "probeVersion": 1,
        "ttlMs": 21600000,
        "servers": {
            "http://line.tivi-ott.net:80": {
                "state": "MEASURED",
                "measuredAt": "2026-11-06T13:59:10.584Z",
                "probeVersion": 1,
                "transport": "node-http",
                "host": "line.tivi-ott.net",
                "scheme": "http",
                "port": "80",
                "type": "XTREAM_HTTP",
                "typeReason": "path /live|movie|series/ user/pass/id",
                "reachable": true,
                "status": 401,
                "latencyMs": 155,
                "authOk": true,
                "accountStatus": "Active",
                "maxConnections": "1",
                "uaSensitive": false,
                "refererTolerant": true,
                "acceptRanges": "bytes",
                "honors206": false,
                "notes": [
                    "Range ignorado: pidio 1024 B y devolvio 101140 B con status 200"
                ],
                "authStatus": 200,
                "rangeStatus": 200,
                "rangeContentRange": null,
                "rangeBytes": 101140,
                "segmentBytes": 82316,
                "inputHash": "4c07423a",
                "baseUrl": "http://line.tivi-ott.net",
                "key": "http://line.tivi-ott.net:80",
                "revision": 1
            },
            "http://nfqdeuxu.x1megaott.store:80": {
                "state": "MEASURED",
                "measuredAt": "2026-11-06T13:59:08.466Z",
                "probeVersion": 1,
                "transport": "node-http",
                "host": "nfqdeuxu.x1megaott.store",
                "scheme": "http",
                "port": "80",
                "type": "XTREAM_HTTP",
                "typeReason": "path /live|movie|series/ user/pass/id",
                "reachable": true,
                "status": 200,
                "latencyMs": 85,
                "authOk": true,
                "accountStatus": "Active",
                "maxConnections": "1",
                "uaSensitive": true,
                "refererTolerant": true,
                "acceptRanges": null,
                "honors206": false,
                "notes": [
                    "con UA curl falla: ECONNRESET",
                    "Range ignorado: pidio 1024 B y devolvio 66294 B con status 200"
                ],
                "authStatus": 200,
                "rangeStatus": 200,
                "rangeContentRange": null,
                "rangeBytes": 66294,
                "segmentBytes": 101046,
                "inputHash": "72c8b364",
                "baseUrl": "http://nfqdeuxu.x1megaott.store",
                "key": "http://nfqdeuxu.x1megaott.store:80",
                "revision": 1
            }
        }
    };
    if (root && typeof root === 'object') { root.APE_SERVER_PROFILES_STORE = STORE; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = STORE; }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
