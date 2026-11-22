const fs = require('fs');
const f = 'js/ape-v9/profile-manager-v9.js';
let s = fs.readFileSync(f, 'utf8');
let n = 0;
function rep(a, b, label) {
    if (s.indexOf(a) < 0) { console.log('NO MATCH: ' + label); return; }
    s = s.replace(a, b); n++; console.log('ok: ' + label);
}

/* ═══ 1 · CASCADAS + GUARD DE CIERRE (t21) ═══════════════════════════════════
 * Regla del operador: tras AUTO-AJUSTAR ningún campo queda vacío y ningún campo
 * que en el perfil tenga N posiciones puede quedar con una sola. */
const anchor = '        _applyPlanValuesFor(profileId, values) {';
const block = [
    '        /* [t21] aridad de un campo: nº de posiciones de la cascada del PERFIL */',
    '        _arityOf(profile, headerName) {',
    '            if (!this.config || typeof this.config.getHeaderValue !== "function") return 1;',
    '            const v = this.config.getHeaderValue(profile.id, headerName);',
    '            return (v === null || v === undefined || String(v) === "") ? 1 : String(v).split(",").length;',
    '        }',
    '',
    '        /* [t21] cascada MONÓTONA de n posiciones a partir del valor del plan.',
    '         * No repite el mismo valor (eso era el defecto de X-Color-Depth): baja',
    '         * por niveles hasta 1. Preserva la aridad del perfil. */',
    '        _cascadeOf(base, n) {',
    '            const b = Math.max(1, Math.round(Number(base) || 1));',
    '            const k = Math.max(1, Number(n) || 1);',
    '            const out = [];',
    '            for (let i = 0; i < k; i++) {',
    '                out.push(Math.max(1, b - i));',
    '            }',
    '            return out.join(",");',
    '        }',
    '',
    '        /* [t21] escribe las cascadas que gobierna el plan conservando su aridad. */',
    '        _reconcilePlanCascades(profile, applied) {',
    '            const r = { plan: {}, declared: [] };',
    '            if (!profile || !this.config || typeof this.config.setHeaderOverride !== "function") return r;',
    '            const a = applied || {};',
    '            const pares = [',
    '                ["X-Parallel-Segments", a.parallel_downloads],',
    '                ["X-Prefetch-Segments", a.prefetch_segments],',
    '                ["X-Concurrent-Downloads", a.parallel_downloads]',
    '            ];',
    '            pares.forEach(function (par) {',
    '                const name = par[0], val = par[1];',
    '                if (val === undefined || val === null) return;',
    '            const ar = ProfileManagerV9._arityOf(profile, name);',
    '            const cas = ProfileManagerV9._cascadeOf(val, ar);',
    '            ProfileManagerV9.config.setHeaderOverride(profile.id, name, cas);',
    '            r.plan[name] = { de: ar, valor: cas };',
    '            });',
    '            return r;',
    '        }',
    '',
    '        /* [t21] GUARD DE CIERRE: ningún campo vacío y ninguna cascada que haya',
    '         * perdido aridad respecto al perfil. Devuelve el informe para el botón. */
        _guardFields(profile) {
            const inf = { vacios: [], vaciosRellenados: [], aridad: [], declarados: [], ok: true };
            if (!profile || !this.config) return inf;
            const hdrs = ["Keep-Alive", "Connection", "Accept-Encoding", "Sec-CH-UA-Platform",
                "X-Dolby-Vision-Profile", "X-Dolby-Vision-Level", "X-APE-STRATEGY", "X-Color-Depth",
                "X-Segment-Duration", "X-Prefetch-Segments", "X-Parallel-Segments", "X-Frame-Rates"];
            const self = this;
            hdrs.forEach(function (name) {
                const v = self.config.getHeaderValue(profile.id, name);
                if (v === null || v === undefined || String(v).trim() === "") {
                    /* rellenar con el valor de OTRO perfil que sí lo tenga (LAB/SSOT) */
                    let donor = null;
                    const all = (self.config.profiles ? Object.keys(self.config.profiles) : []);
                    for (let i = 0; i < all.length; i++) {
                        const pv = self.config.getHeaderValue(all[i], name);
                        if (pv !== null && pv !== undefined && String(pv).trim() !== "") { donor = String(pv); break; }
                    }
                    if (donor) {
                        self.config.setHeaderOverride(profile.id, name, donor);
                        inf.vaciosRellenados.push(name + ' = ' + donor);
                    } else {
                        inf.vacios.push(name);
                        inf.ok = false;
                    }
                }
            });
            /* aridad: ningún campo que el plan gobierna puede quedar con 1 posición */
            ["X-Prefetch-Segments", "X-Parallel-Segments", "X-Concurrent-Downloads"].forEach(function (name) {
                const v = self.config.getHeaderValue(profile.id, name);
                if (v !== null && v !== undefined && String(v).indexOf(",") < 0) {
                    inf.aridad.push(name + ' = ' + v + ' (una sola posición)');
                    inf.ok = false;
                }
            });
            /* los que el SSOT declara con 1 posición se DECLARAN, no se falsean */
            ["Connection", "Accept-Encoding", "Sec-CH-UA-Platform"].forEach(function (name) {
                const v = self.config.getHeaderValue(profile.id, name);
                if (v !== null && v !== undefined && String(v).indexOf(",") < 0) {
                    inf.declarados.push(name + ' = ' + v + ' (aridad 1 por diseño del SSOT)');
                }
            });
            return inf;
        }',
    '        _applyPlanValuesFor(profileId, values) {'
].join('\n');
rep(anchor, block, 'cascadas + guard de cierre');

fs.writeFileSync(f, s);
console.log('cambios: ' + n);
