<?php
/**
 * ape-quality-sync.php — empuja los levers homologados a cada ARA que hace heartbeat.
 *
 * PROBLEMA QUE RESUELVE
 *   ape_device_quality.php sabe que claves corresponden a cada SoC, y push_pq_profile.php
 *   puede insertarlas, pero NADIE las invocaba. El ARA del Fire TV llevaba horas con su
 *   last-known-good y los com.amazon.tv.* nunca le llegaban.
 *
 * COMO LO RESUELVE, SIN TOCAR NADA QUE YA FUNCIONA
 *   Lee ara_heartbeats (la tabla que el ARA ya escribe), resuelve la familia del SoC con
 *   ape_quality_soc_family(), y si ese device NO tiene un delta de calidad vigente, inserta
 *   uno nuevo con ape_insert_delta(). No modifica endpoints, ni el SSE, ni el heartbeat, ni
 *   ape_mesh.php. Es un consumidor mas de la misma base.
 *
 * POR QUE NO USA ape_soc_allowlisted()
 *   Esa funcion mira ara_heartbeats.caps_json.soc, y el APK del Fire TV declara
 *   soc='AMLS905Y4' sobre un MT8696 real. Confiar en ese campo haria que el gate lo
 *   rechazara para siempre (fail-closed eterno) o, peor, que se le tratara como Amlogic.
 *   ape_quality_soc_family() resuelve por device_id primero, que es lo fiable.
 *
 * IDEMPOTENCIA
 *   Antes de insertar se comprueba si hay un policy_delta de tipo 'device-setting',
 *   source 'pq-profile-sync' y target ese device, con expires_at > ahora. Si existe, no se
 *   duplica. El TTL es 1800 s, asi que en regimen estacionario se re-empuja cada media hora,
 *   que es lo mismo que hace el resto del bus.
 *
 * SEGURIDAD
 *   - Solo lectura de ara_heartbeats salvo el INSERT del delta.
 *   - Ignora heartbeats de mas de 15 minutos (device apagado o desconectado).
 *   - No imprime caps ni contenido de la URL del canal (el delta no lleva canal).
 *   - NUNCA lanza: cualquier fallo se reporta y se sigue con el siguiente device.
 *
 * Uso:
 *   php ape-quality-sync.php              aplica
 *   php ape-quality-sync.php --dry        solo reporta
 *   php ape-quality-sync.php --profile sports
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_mesh.php';
require_once __DIR__ . '/../lib/ape_device_quality.php';

$DRY = in_array('--dry', $argv, true);
$PROFILE = 'max_image';
foreach ($argv as $i => $a) {
    if ($a === '--profile' && isset($argv[$i + 1])) {
        $PROFILE = preg_replace('/[^a-z_]/', '', strtolower($argv[$i + 1]));
    }
}

const SYNC_SOURCE = 'pq-profile-sync';
const SYNC_TTL = 1800;
const MAX_AGE_SECONDS = 900;   // 15 min: mas viejo = device apagado

function sync_log(string $s): void { echo $s . "\n"; }

try {
    $db = ape_policy_db();
} catch (Throwable $e) {
    fwrite(STDERR, "error: no se pudo abrir la base: " . $e->getMessage() . "\n");
    exit(1);
}

// heartbeats recientes
try {
    $st = $db->prepare('SELECT device_id, last_seen, player, ara_version, caps_json
                        FROM ara_heartbeats WHERE last_seen > :cut ORDER BY last_seen DESC');
    $st->execute(array(':cut' => time() - MAX_AGE_SECONDS));
    $devices = $st->fetchAll();
} catch (Throwable $e) {
    fwrite(STDERR, "error: no se pudo leer ara_heartbeats: " . $e->getMessage() . "\n");
    exit(1);
}

sync_log('=== ARA quality sync ===');
sync_log('  perfil    : ' . $PROFILE);
sync_log('  modo      : ' . ($DRY ? 'DRY (no escribe)' : 'APLICA'));
sync_log('  devices   : ' . count($devices) . ' con heartbeat < ' . MAX_AGE_SECONDS . 's');
sync_log('');

if (empty($devices)) {
    sync_log('  nada que hacer.');
    exit(0);
}

$aplicados = 0;
$saltados = 0;
$vigentes = 0;
$errores = 0;

foreach ($devices as $d) {
    $id = (string)$d['device_id'];

    // 1) familia del SoC — por device_id primero (el caps del APK miente en Fire TV)
    $family = ape_quality_soc_family($id);
    if ($family === null) {
        sync_log('  SKIP   ' . substr($id, 0, 26) . '  soc no reconocido');
        $saltados++;
        continue;
    }

    // 2) plan de levers
    $plan = ape_quality_plan($id, $PROFILE);
    if (empty($plan['ok'])) {
        sync_log('  SKIP   ' . substr($id, 0, 26) . '  ' . ($plan['reason'] ?? 'sin plan'));
        $saltados++;
        continue;
    }

    $levers = array();
    foreach ($plan['levers'] as $ns => $kv) {
        foreach ($kv as $k => $v) { $levers[$k] = $v; }
    }

    // 3) ¿ya hay un delta vigente de esta fuente para este device?
    try {
        $q = $db->prepare("SELECT id, expires_at FROM policy_deltas
                           WHERE target_device_id = :d AND delta_type = 'device-setting'
                             AND source = :s AND expires_at > :now
                           ORDER BY id DESC LIMIT 1");
        $q->execute(array(':d' => $id, ':s' => SYNC_SOURCE, ':now' => time()));
        $existente = $q->fetch();
    } catch (Throwable $e) {
        sync_log('  ERROR  ' . substr($id, 0, 26) . '  consulta: ' . $e->getMessage());
        $errores++;
        continue;
    }

    if ($existente) {
        $faltan = (int)$existente['expires_at'] - time();
        sync_log('  OK     ' . substr($id, 0, 26) . '  ' . $family . '  delta id=' . $existente['id']
            . ' vigente (' . $faltan . 's)  ' . count($levers) . ' levers');
        $vigentes++;
        continue;
    }

    // 4) insertar
    if ($DRY) {
        sync_log('  DRY    ' . substr($id, 0, 26) . '  ' . $family . '  insertaria ' . count($levers) . ' levers');
        $aplicados++;
        continue;
    }
    try {
        $nuevoId = ape_insert_delta($id, null, 'device-setting', array(
            'settings' => $levers,
            'profile' => 'PQ_' . strtoupper($PROFILE),
            'homologacion' => $plan['homologacion'] ?? array(),
            'sync' => array('source' => SYNC_SOURCE, 'at' => gmdate('c')),
        ), array('source' => SYNC_SOURCE, 'ttl_seconds' => SYNC_TTL, 'priority' => 80));
        sync_log('  PUSH   ' . substr($id, 0, 26) . '  ' . $family . '  delta id=' . $nuevoId
            . '  ' . count($levers) . ' levers  ttl=' . SYNC_TTL . 's');
        foreach (($plan['homologacion'] ?? array()) as $cap => $estado) {
            sync_log('           ' . $cap . ' -> ' . substr($estado, 0, 78));
        }
        $aplicados++;
    } catch (Throwable $e) {
        sync_log('  ERROR  ' . substr($id, 0, 26) . '  insert: ' . $e->getMessage());
        $errores++;
    }
}

sync_log('');
sync_log('=== resumen ===');
sync_log('  empujados : ' . $aplicados);
sync_log('  ya vigentes: ' . $vigentes);
sync_log('  saltados  : ' . $saltados);
sync_log('  errores   : ' . $errores);

exit($errores > 0 ? 1 : 0);
