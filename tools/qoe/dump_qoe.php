<?php
// Lee SOLO la base de QoE del VPS y la vuelca como JSON. No escribe nada.
$rutas = ['/opt/netshield/data/conviva.db', '/var/www/html/prisma/db/conviva.db'];
$out = ['ok' => false, 'rutas_probadas' => $rutas];
foreach ($rutas as $r) {
    if (!is_readable($r)) { continue; }
    try {
        $pdo = new PDO('sqlite:' . $r);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $tablas = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
        $out['ruta'] = $r; $out['tablas'] = $tablas;
        foreach ($tablas as $t) {
            if (!preg_match('/(qoe|metric|server_side)/i', $t)) { continue; }
            $cols = $pdo->query('PRAGMA table_info(' . $t . ')')->fetchAll(PDO::FETCH_ASSOC);
            $out['esquema'][$t] = array_map(function ($c) { return $c['name']; }, $cols);
            $filas = $pdo->query('SELECT * FROM ' . $t . ' ORDER BY rowid DESC LIMIT 2000')->fetchAll(PDO::FETCH_ASSOC);
            $out['filas'][$t] = $filas;
        }
        $out['ok'] = true;
        break;
    } catch (Throwable $e) { $out['error'] = $e->getMessage(); }
}
echo json_encode($out);