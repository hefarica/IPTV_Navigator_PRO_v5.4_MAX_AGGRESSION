#!/usr/bin/env node
'use strict';
/**
 * test_no_render_loop.js — REGRESIÓN DEL BUCLE DE RENDER (2026-11-06)
 * ═══════════════════════════════════════════════════════════════════════════
 * Bug medido: al recargar la UI, la consola se inundaba (cientos de líneas/s) y
 * los valores del Gestor derivaban a negativos (buffer_target_seconds -5…-70,
 * Network(C1) -13000ms).
 *
 * Causa raíz: `ape-ui-persistence.js` restauraba los controles escribiendo
 * `el.value` y **disparando input/change**. Esos eventos sintéticos entraban en
 * `ProfileManagerV9.updateSetting()` → motor reactivo → `render()` → DOM nuevo
 * → MutationObserver → restaurar otra vez. Bucle infinito: cada render crea
 * nodos NUEVOS que siempre están "en su valor por defecto", así que la
 * restauración volvía a aplicar y volvía a disparar.
 *
 * Este test cierra el ciclo en un DOM falso: si la escritura deja de ser
 * idempotente o el camino del observador deja de ser silencioso, el contador de
 * renders explota y el test falla.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const FE = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend');
const API = require(path.join(FE, 'js', 'ape-ui-persistence.js'));

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
    if (cond) { pass++; console.log('PASS ' + name); }
    else { fail++; console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
};

// ── DOM falso con CICLO CERRADO ─────────────────────────────────────────────
// `dispatchEvent` simula lo que hace el navegador con el handler inline del
// Gestor: escribe el valor en el modelo y vuelve a pintar el panel (nodos
// nuevos, todos en su valor por defecto). Es exactamente el bucle real.
function makeEnv(model0) {
    const env = { model: Object.assign({}, model0), renders: 0, dispatches: 0, nodes: [] };

    env.createControls = () => {
        env.nodes = Object.keys(env.model).map((id) => makeControl(env, id));
    };
    env.render = () => { env.renders++; env.createControls(); };
    env.createControls();
    return env;
}

function makeControl(env, id) {
    const el = {
        nodeType: 1,
        tagName: 'INPUT',
        id: id,
        name: '',
        disabled: false,
        isConnected: true,
        value: String(env.model[id]),
        defaultValue: String(env.model[id]),
        _attrs: { type: 'number' },
        _noPersistAncestor: false,
        getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : null; },
        closest() { return this._noPersistAncestor ? { getAttribute: () => '1' } : null; },
        matches() { return true; },
        querySelectorAll() { return []; },
        dispatchEvent(ev) {
            env.dispatches++;
            // Handler inline del Gestor: los <input type=number> del panel usan
            // oninput (fps, bufferSeconds). `change` no reescribe ahí, pero SÍ
            // cuenta como evento emitido: por eso una restauración = 2 eventos.
            if (ev && ev.type === 'input') {
                env.model[id] = this.value;
                env.render();
            }
            return true;
        }
    };
    el.ownerDocument = { querySelectorAll: (sel) => (String(sel).indexOf('[name=') === 0 ? [] : env.nodes) };
    return el;
}

/** Una pasada del MutationObserver: aplica a los nodos recién pintados. */
function drainPass(env, state, opts) {
    let applied = 0;
    for (let i = 0; i < env.nodes.length; i++) applied += API._applyOne(env.nodes[i], state, opts);
    return applied;
}

console.log('== BUCLE DE RENDER · capa de persistencia de UI ==');
ok('API con guardas expuestas', !!(API._applyOne && API._sameValue && API._ambient),
    'faltan helpers en el export');

// ── 1. PUNTO FIJO: la restauración silenciosa NO dispara eventos ────────────
// Escenario real: el modelo ya tiene el valor bueno (30) y el estado persistido
// tiene otro (60). El observador repone 60 SIN disparar input/change.
{
    const env = makeEnv({ ctrl1: '30' });
    const state = { controls: { 'id:ctrl1': '60' } };
    const applied = drainPass(env, state, { force: false, silent: true });
    ok('restauración silenciosa aplica el valor', applied === 1 && env.nodes[0].value === '60',
        'applied=' + applied + ' value=' + (env.nodes[0] && env.nodes[0].value));
    ok('restauración silenciosa NO dispara eventos', env.dispatches === 0, 'dispatches=' + env.dispatches);
    ok('restauración silenciosa NO re-renderiza', env.renders === 0, 'renders=' + env.renders);
}

// ── 2. PUNTO FIJO: repetir la restauración no vuelve a disparar ─────────────
// Es la prueba de convergencia: tras la primera aplicación, cualquier pasada
// posterior (por muchas mutaciones que haya) es inerte.
{
    const env = makeEnv({ fps: '60' });
    const state = { controls: { 'id:fps': '30' } };
    // Pasada 1 = restauración de arranque (dispara eventos, es el comportamiento
    // correcto: el panel debe recalcular con lo persistido). Una escritura emite
    // input + change = 2 eventos; sólo `input` vuelve a pintar el panel.
    drainPass(env, state, { force: false });
    const afterFirst = env.dispatches;
    const rendersAfterFirst = env.renders;
    // Pasadas 2..6 = observador (silencioso): deben ser inertes.
    for (let i = 0; i < 5; i++) drainPass(env, state, { force: false, silent: true });
    ok('el arranque emite input+change (2 eventos, no más)', afterFirst === 2, 'dispatches=' + afterFirst);
    ok('el arranque re-renderiza exactamente 1 vez', rendersAfterFirst === 1, 'renders=' + rendersAfterFirst);
    ok('5 pasadas posteriores del observador no disparan nada', env.dispatches === afterFirst,
        'dispatches=' + env.dispatches);
    ok('5 pasadas posteriores no re-renderizan', env.renders === rendersAfterFirst,
        'renders=' + env.renders);
    ok('el modelo converge al valor persistido', env.model.fps === '30', 'modelo=' + env.model.fps);
}

// ── 3. IDEMPOTENCIA: si ya coincide, no se escribe ni se dispara ────────────
{
    const env = makeEnv({ buffer_sec: '45' });
    const state = { controls: { 'id:buffer_sec': '45' } };
    ok('sameValue detecta coincidencia', API._sameValue(env.nodes[0], '45') === true);
    ok('sameValue detecta diferencia', API._sameValue(env.nodes[0], '46') === false);
    for (let i = 0; i < 10; i++) drainPass(env, state, { force: true });   // force + igual → inerte
    ok('force sobre el mismo valor no dispara eventos', env.dispatches === 0, 'dispatches=' + env.dispatches);
}

// ── 4. BUCLE CERRADO CON TOPE DURO (si algo regresiona, falla rápido) ───────
// Simula el peor caso: modelo que NO converge porque el handler sigue
// reescribiendo el valor. El bucle se corta por el tope de iteraciones del test
// y, sobre todo, el camino silencioso no puede alimentarlo.
{
    const env = makeEnv({ x: '1' });
    const state = { controls: { 'id:x': '2' } };
    let iter = 0;
    while (env.renders < 3 && iter < 50) { drainPass(env, state, { force: false, silent: true }); iter++; }
    ok('camino silencioso no puede alimentar un bucle de render', env.renders < 3,
        'renders=' + env.renders + ' iter=' + iter);
}

// ── 5. data-ape-nopersist (panel con otro SSOT) ────────────────────────────
{
    const env = makeEnv({ pm9_fps: '60' });
    env.nodes[0]._noPersistAncestor = true;
    const state = { controls: { 'id:pm9_fps': '24' } };
    const applied = drainPass(env, state, { force: true });
    ok('control bajo panel data-ape-nopersist se ignora', applied === 0 && env.nodes[0].value === '60',
        'applied=' + applied + ' value=' + env.nodes[0].value);
    ok('isSkipped honra el atributo en el propio control',
        API._isSkipped({ tagName: 'INPUT', getAttribute: (k) => (k === 'data-ape-nopersist' ? '1' : (k === 'type' ? 'text' : null)) }) === true);
}

// ── 6. Guardia de reentrada de _apply ──────────────────────────────────────
{
    const env = makeEnv({ a: '1' });
    const state = { controls: { 'id:a': '9' } };
    const doc = { querySelectorAll: () => env.nodes };
    API._ambient.applying = true;
    const r = API._apply(doc, state, { force: true });
    API._ambient.applying = false;
    ok('_apply se bloquea durante una aplicación en curso', r.reentrant === true && r.applied === 0,
        JSON.stringify(r));
    ok('_apply funciona fuera de la reentrada',
        API._apply(doc, state, { force: true, silent: true }).applied === 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// GUARDAS ESTÁTICAS — el código desplegado debe llevar las protecciones
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n== GUARDAS ESTÁTICAS en el código fuente ==');
const read = (p) => fs.readFileSync(path.join(FE, p), 'utf8');
const G = read('js/ape-v9/m3u8-typed-arrays-ultimate.js');
const P = read('js/ape-v9/profile-manager-v9.js');
const C = read('js/ape-v9/ape-profiles-config.js');
const U = read('js/ape-ui-persistence.js');
const H = fs.readFileSync(path.join(FE, 'index-v4.html'), 'utf8');

const must = (file, label, src, needle) => ok(label, src.indexOf(needle) >= 0, 'no se encontró: ' + needle);

must('ui-persistence', 'persistencia: escritura idempotente (sameValue)', U, 'function sameValue');
must('ui-persistence', 'persistencia: escritura silenciosa (silent)', U, 'if (opts.silent) return true;');
must('ui-persistence', 'persistencia: guardia de reentrada', U, 'if (AMBIENT.applying)');
must('ui-persistence', 'persistencia: presupuesto anti-bucle', U, 'APPLY_BUDGET_PER_SEC');
must('ui-persistence', 'persistencia: opt-out por atributo/ancestro', U, "closest('[data-ape-nopersist]')");
must('ui-persistence', 'persistencia: observador silencioso', U, '{ force: false, silent: true }');
must('ui-persistence', 'persistencia: versión 1.1.0', U, "version: '1.1.0'");

must('pm9', 'gestor: render coalescido', P, 'if (this._renderBusy)');
must('pm9', 'gestor: techo de renders/s', P, 'this._renderWin.n > 20');
must('pm9', 'gestor: presupuesto de escrituras', P, 'this._writeWin.n > 25');
must('pm9', 'gestor: profundidad de cascada reactiva', P, 'this._rxDepth > 8');
must('pm9', 'gestor: rechazo de buffer <= 0', P, "no es un buffer válido (>0)");
must('pm9', 'gestor: panel marcado como no persistible', P, 'data-ape-nopersist="1"');

must('profiles-config', 'perfiles: reglas numéricas de prefetch', C, 'const NUMERIC_RULES');
must('profiles-config', 'perfiles: log de guardado throttled', C, 'this._lastPersistLogAt');
must('profiles-config', 'perfiles: paridad VPS con cooldown', C, 'this._lastParitySyncAt');

must('generator', 'córtex: tope de espera del gate', G, '_STEALTH_MAX_GATE_MS');
must('generator', 'córtex: distingue host caído (status 0)', G, 'const hostDown = (status === 0)');
must('generator', 'córtex: no se aplica a same-origin', G, '_stealthSameOrigin(host)');
ok('córtex: se ELIMINÓ la espera del cooldown completo',
    G.indexOf('await _stealthSleep(state.cooldownUntil - Date.now());') < 0,
    'sigue el patrón que colgaba hasta 13,7 min');

// Cache-busting: el navegador debe pedir las versiones nuevas
must('index', 'cache-bust: profile-manager-v9', H, 'profile-manager-v9.js?v=20261106-rx-guard');
must('index', 'cache-bust: ape-profiles-config', H, 'ape-profiles-config.js?v=20261106-rx-guard2');
must('index', 'cache-bust: ape-ui-persistence', H, 'ape-ui-persistence.js?v=20261106-persist2');
must('index', 'cache-bust: m3u8-typed-arrays-ultimate', H, 'm3u8-typed-arrays-ultimate.js?v=20261106-cortex-cap');

console.log('\nRESUMEN NO-RENDER-LOOP: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exitCode = fail ? 1 : 0;
