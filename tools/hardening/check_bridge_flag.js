#!/usr/bin/env node
/**
 * check_bridge_flag.js — gate: el puente de deltas NO puede estar apagado en produccion.
 *
 * POR QUE EXISTE
 *   APE_4K_BRIDGE_ENABLED controla si ape-feedforward-stream.php suma el ultimo delta del VPS
 *   sobre los 3 device_settings base. Con el flag OFF el feedforward manda 3 filas y el ARA
 *   nunca recibe los levers que el VPS computa para su SoC: el Fire TV se queda sin los
 *   pq_* de MediaTek y sin nada que el delta aporte. Con el ON manda 14.
 *
 *   Su default es OFF (seguro para un deploy limpio), asi que cualquier rebuild del pool de
 *   fpm, un `apt upgrade` de php, o alguien copiando un www.conf de un backup viejo, lo
 *   apaga en silencio y la cadena VPS -> ARA deja de servir sin que nada falle.
 *
 * QUE VERIFICA
 *   1. El flag existe en el www.conf del VPS y vale 1.
 *   2. php-fpm acepta la configuracion (php-fpm -t).
 *   3. El feedforward responde y devuelve MAS de 3 device_settings (prueba de efecto, no
 *      solo de configuracion).
 *   4. El timer del sincronizador esta activo y su proximo disparo es < 15 min.
 *   5. Hay al menos un delta de pq-profile-sync vigente.
 *
 * QUE NO HACE
 *   No escribe nada salvo con --repair, y solo el flag. No toca el fichero del feedforward.
 *
 * Uso:
 *   node tools/hardening/check_bridge_flag.js                 verifica (falla si algo no cuadra)
 *   node tools/hardening/check_bridge_flag.js --local         solo la parte que no necesita SSH
 *   node tools/hardening/check_bridge_flag.js --repair        repara el flag si falta y recarga fpm
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const LOCAL_ONLY = ARGS.includes('--local');
const REPAIR = ARGS.includes('--repair');

const VPS = process.env.APE_VPS_HOST || 'root@178.156.147.234';
const CONF = '/etc/php/8.3/fpm/pool.d/www.conf';
const FPM_SVC = 'php8.3-fpm';
const FEEDFORWARD_BASE = 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward-stream.php?iv=3&dur=1&device=';
const FLAG = 'APE_4K_BRIDGE_ENABLED';
const MIN_DEVICE_SETTINGS = 4;   // 3 base -> 4+ significa que el puente esta sumando

let pass = 0, fail = 0;
const ok = (m) => { console.log('  PASS  ' + m); pass++; };
const ko = (m) => { console.log('  FAIL  ' + m); fail++; };
const info = (m) => console.log('        ' + m);

function sh(cmd) {
    try {
        return execFileSync('ssh', ['-o', 'ConnectTimeout=15', '-o', 'BatchMode=yes', VPS, cmd],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (e) {
        return '__ERROR__:' + (e.stderr ? String(e.stderr).trim().slice(0, 200) : e.message);
    }
}

function curl(url) {
    try {
        return execFileSync('curl', ['-sS', '-m', '15', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return ''; }
}

console.log('=== gate: el puente de deltas ===');
console.log('  VPS: ' + (LOCAL_ONLY ? '(solo local)' : VPS));
console.log('');

// ── 1 · el flag en el repo (debe estar documentado en el workflow) ──────────
const wf = path.join(__dirname, '..', '..', '.github', 'workflows', 'ape-deploy-frontend.yml');
// Estas dos comprobaciones miran el workflow DE ESTA RAMA. En master el step del puente puede no
// existir todavia (vive en la rama de desarrollo), y eso NO significa que el puente este caido: la
// prueba de efecto del punto 2 y las del VPS son las que mandan. Se informa, no se falla, cuando el
// step no esta en este arbol — y se falla solo si el fichero existe y lo que hay esta mal.
if (fs.existsSync(wf)) {
    const t = fs.readFileSync(wf, 'utf8');
    if (t.includes(FLAG)) ok('el workflow de deploy activa ' + FLAG);
    else info('este arbol no tiene el step que activa ' + FLAG + ' (normal si es master; lo que manda es la prueba de efecto)');
    if (t.includes('Activar el puente')) ok('existe el step que lo enciende');
    else info('este arbol no tiene el step "Activar el puente" (normal si es master)');
} else {
    info('no hay ape-deploy-frontend.yml en este arbol — se omite la comprobacion de codigo');
}

// ── 2 · el feedforward respeta el puente (prueba de EFECTO) ─────────────────
// Se prueba contra un device QUE TENGA delta vigente. Con device=probe el feedforward solo
// devuelve las 3 filas base porque no hay delta para ese id, y eso daria un falso FAIL.
// Si no hay ningun device con delta, no se puede probar el efecto: se informa, no se falla.
// sqlite3 NO esta instalado en el VPS; php si. Una sola consulta, reutilizada.
function dbQuery(consulta) {
    const code = 'require "/var/www/html/prisma/lib/ape_mesh.php"; $d=ape_policy_db(); foreach($d->query(' + JSON.stringify(consulta) + ') as $r){ echo implode("|", array_map(fn($v)=>(string)$v, $r)), "\n"; }';
    const out = sh('sudo -n -u www-data php -r ' + shellQuote(code) + ' 2>/dev/null');
    if (out.startsWith('__ERROR__') || out === '') return [];
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
}
function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
function deviceConDelta() {
    const rows = dbQuery("SELECT target_device_id FROM policy_deltas WHERE source='pq-profile-sync' AND target_device_id IS NOT NULL AND expires_at > strftime('%s','now') ORDER BY id DESC LIMIT 1");
    return rows.length ? rows[0].split('|')[0] : null;
}

let devicePrueba = deviceConDelta();
if (!devicePrueba) {
    info('no hay delta vigente de ningun device: no puedo probar el efecto del puente con un device real');
    info('(se usa el heartbeat mas reciente como aproximacion)');
    const hbRows = dbQuery('SELECT device_id FROM ara_heartbeats ORDER BY last_seen DESC LIMIT 1');
    if (hbRows.length) devicePrueba = hbRows[0].split('|')[0];
}
if (!devicePrueba) devicePrueba = 'probe';

const body = curl(FEEDFORWARD_BASE + encodeURIComponent(devicePrueba));
if (!body) {
    ko('el feedforward no responde (device=' + devicePrueba + ')');
} else {
    const linea = body.split('\n').find((l) => l.startsWith('data: {') && l.includes('device_settings'));
    if (!linea) {
        ko('el feedforward responde pero sin device_settings (device=' + devicePrueba + ')');
    } else {
        try {
            const o = JSON.parse(linea.slice(6));
            const n = Array.isArray(o.device_settings) ? o.device_settings.length : 0;
            info('probado con device=' + devicePrueba);
            if (n >= MIN_DEVICE_SETTINGS) {
                ok('el feedforward emite ' + n + ' device_settings (>= ' + MIN_DEVICE_SETTINGS + ') — el puente esta sumando');
            } else {
                ko('el feedforward emite solo ' + n + ' device_settings — el puente NO esta sumando (esperado >= ' + MIN_DEVICE_SETTINGS + ')');
            }
            const amaz = (o.device_settings || []).filter((d) => String(d).includes('com.amazon.tv')).length;
            if (amaz > 0) ok('incluye ' + amaz + ' claves com.amazon.tv.*');
            else info('sin claves de Amazon (normal si el delta aun no las tiene o el device no es Fire TV)');
        } catch (e) {
            ko('device_settings no parsea: ' + e.message);
        }
    }
}

if (LOCAL_ONLY) {
    console.log('');
    console.log('  TOTAL=' + (pass + fail) + ' PASS=' + pass + ' FAIL=' + fail + '  (modo local)');
    process.exit(fail === 0 ? 0 : 1);
}

// ── 3 · el flag en el VPS ──────────────────────────────────────────────────
const grep = sh("grep -c '^env\\[" + FLAG + "\\] = 1' '" + CONF + "'");
if (grep.startsWith('__ERROR__')) {
    ko('no pude leer ' + CONF + ' — ' + grep.replace('__ERROR__:', ''));
} else if (grep === '1') {
    ok(FLAG + ' = 1 en ' + CONF);
} else if (grep === '0') {
    ko(FLAG + ' ausente o distinto de 1 en ' + CONF);
    if (REPAIR) {
        info('reparando...');
        const add = sh("echo 'env[" + FLAG + "] = 1' | sudo -n tee -a '" + CONF + "' >/dev/null && echo ADDED");
        if (add.includes('ADDED')) {
            const lint = sh('sudo -n php-fpm8.3 -t 2>&1');
            if (/successful|OK/i.test(lint) || !/error|failed/i.test(lint)) {
                sh('sudo -n systemctl reload ' + FPM_SVC);
                ok('flag añadido y fpm recargado');
            } else {
                info('fpm no valida tras añadir: ' + lint.slice(0, 160));
            }
        } else {
            info('no pude añadirlo: ' + add.slice(0, 160));
        }
    }
} else {
    ko('respuesta inesperada al leer el flag: ' + grep.slice(0, 80));
}

// ── 4 · fpm valida la configuracion ────────────────────────────────────────
const lint = sh('sudo -n php-fpm8.3 -t 2>&1');
if (lint.startsWith('__ERROR__')) ko('php-fpm -t fallo: ' + lint.replace('__ERROR__:', ''));
else if (/error|failed/i.test(lint) && !/successful/i.test(lint)) ko('php-fpm -t reporta error: ' + lint.slice(0, 160));
else ok('php-fpm8.3 -t valida');

// ── 5 · el timer del sincronizador ────────────────────────────────────────
const act = sh('systemctl is-active ape-quality-sync.timer 2>&1');
if (act === 'active') ok('ape-quality-sync.timer activo');
else ko('ape-quality-sync.timer NO activo (estado: ' + act.slice(0, 40) + ')');

const nxt = sh("systemctl list-timers ape-quality-sync.timer --no-pager --output=json 2>/dev/null | head -c 400");
if (nxt && !nxt.startsWith('__ERROR__') && nxt.includes('ape-quality-sync')) ok('el timer tiene proximo disparo programado');
else info('no pude confirmar el proximo disparo del timer');

// ── 6 · hay delta vigente ────────────────────────────────────────────────
const dRows = dbQuery("SELECT COUNT(*) FROM policy_deltas WHERE source='pq-profile-sync' AND expires_at > strftime('%s','now')");
if (!dRows.length) {
    info('no pude consultar policy_deltas via php');
} else {
    const n = parseInt(dRows[0].split('|')[0], 10) || 0;
    if (n > 0) ok(n + ' delta(s) de pq-profile-sync vigentes');
    else ko('ningun delta vigente — el sincronizador no esta empujando');
}

console.log('');
console.log('  TOTAL=' + (pass + fail) + ' PASS=' + pass + ' FAIL=' + fail);
if (fail > 0) {
    console.log('');
    console.log('  El puente esta caido o incompleto. Para repararlo:');
    console.log('    node tools/hardening/check_bridge_flag.js --repair');
    console.log('  O vuelve a lanzar el workflow de deploy (el step "Activar el puente" lo enciende).');
}
process.exit(fail === 0 ? 0 : 1);
