<?php
// Mock PHP test environment
$_GET['ch'] = 'rtk.al';
$_GET['p'] = 'P1';

$_SERVER['HTTP_USER_AGENT'] = 'Mozilla/5.0 (Linux; Android 11; AFTKM) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

echo "INICIANDO PRUEBA DEL SELF-HEALING GUARDIAN...\n";

// Capture output
ob_start();
require __DIR__ . '/resolve_quality.php';
$output = ob_get_clean();

echo "\n============================================\n";
echo "RESULTADO DEL RESOLVER:\n";
echo "============================================\n";
echo $output;
echo "\n============================================\n";

if (strpos($output, 'line.tivi-ott.net') !== false || strpos($output, 'pro.123sat.net') !== false || strpos($output, 'line.dndnscloud.ru') !== false) {
    echo "¡PRUEBA EXITOSA! Se construyó la URL del stream.\n";
} else {
    echo "Falla en la construcción de la URL.\n";
}
