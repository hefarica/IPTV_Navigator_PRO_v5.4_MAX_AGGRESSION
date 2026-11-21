/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE 4K/6K SIDECAR CONSUMER v1.0 — lee y valida la intención, NO la ejecuta
 * ═══════════════════════════════════════════════════════════════════════════
 * Niveles de evidencia que este módulo separa a propósito:
 *   · metadata leída y validada        → `ok`, `planes`
 *   · metadata aplicable al reproductor → `aplicables` (hoy vacío: no hay motor)
 *   · procesamiento de vídeo ejecutado  → `procesamiento: 'no_ejecutado'` SIEMPRE
 *
 * No toca REA, no toca EXTSHIMOTT, no reescribe la lista. Solo interpreta.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.APE_4K6K_CONSUMER = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var TAG = '#EXT-X-APE-4K6K-INTENT:';
    var SCHEMA = 'ape-4k-premium6k-intent/1';
    var RE_RES = /^\d{2,5}x\d{2,5}$/;
    var IDS = ['P0','P1','P2','P3','P4','P5','P0.5','P1.5','P2.5','P3.5','P4.5','P5.5'];

    function leer(texto) {
        var lineas = String(texto || '').split(/\r?\n/);
        var planes = [], errores = [], completa = true;
        for (var i = 0; i < lineas.length; i++) {
            var l = lineas[i];
            if (l.indexOf(TAG) !== 0) continue;
            var payload, j;
            try { payload = JSON.parse(l.slice(TAG.length)); }
            catch (e) { errores.push({ linea: i + 1, error: 'json_invalido' }); completa = false; continue; }
            var id = payload && payload.outputPolicy && payload.outputPolicy.profile;
            var sel = payload && payload.selectedProfile;
            var tgt = payload && payload.targetResolution;
            var prm = payload && payload.outputPolicy && payload.outputPolicy.premiumResolution;
            var problemas = [];
            if (payload.schema !== SCHEMA) problemas.push('schema');
            if (payload.status !== 'requested_only') problemas.push('status');
            if (IDS.indexOf(id) < 0) problemas.push('profile');
            if (sel !== null && sel !== undefined && IDS.indexOf(sel) < 0) problemas.push('selectedProfile');
            if (!RE_RES.test(String(tgt))) problemas.push('targetResolution');
            if (!RE_RES.test(String(prm))) problemas.push('premiumResolution');
            if (payload.reaFieldsWritten !== 0) problemas.push('rea_modificada');
            if (payload.outputPolicy && payload.outputPolicy.executed !== false) problemas.push('executed_declarado');
            if (problemas.length) { errores.push({ linea: i + 1, error: problemas.join(',') }); completa = false; }
            planes.push({
                linea: i + 1,
                profile: id,
                selectedProfile: (sel === undefined ? null : sel),
                target: tgt,
                premium: prm,
                /* separación explícita de niveles */
                aplicable: false,                 /* no hay motor que aplique la intención */
                aplicableMotivo: 'sin_motor_de_aplicacion',
                procesamiento: 'no_ejecutado'
            });
        }
        return {
            schema: SCHEMA,
            // Este consumidor es de METADATA: jamás afirmar ejecución de vídeo.
            processing_executed: false,
            metadata_valid: completa && errores.length === 0 && planes.length > 0,
            sidecars: planes.length,
            planes: planes,
            aplicables: [],
            errores: errores,
            limite: 'lectura y validación de metadata; el render/procesado no se ejecuta aquí'
        };
    }

    return { version: '1.0.0', TAG: TAG, SCHEMA: SCHEMA, IDS: IDS, leer: leer };
}));
