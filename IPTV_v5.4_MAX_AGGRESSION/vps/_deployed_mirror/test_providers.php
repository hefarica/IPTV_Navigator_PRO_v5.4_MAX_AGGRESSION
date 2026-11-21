<?php
require_once __DIR__ . '/ape_credentials.php';

$providersToTest = [
    'line.tivi-ott.net',
    'nov202gg.xyz:80',
    'ky-tv.cc:80'
];

echo "=== REPORTE DE URLS GENERADAS ===\n\n";

foreach ($providersToTest as $originalHost) {
    echo "Testeando Host Origen: $originalHost\n";
    $resolved = ApeCredentials::resolve($originalHost, '', '');
    
    $finalUrl = "http://{$resolved['host']}/player_api.php?username={$resolved['user']}&password={$resolved['pass']}&action=get_live_categories";
    echo "  - Usuario SSOT: {$resolved['user']}\n";
    echo "  - Pass SSOT:    {$resolved['pass']}\n";
    echo "  - URL Armada:   $finalUrl\n";
    
    // Check if the URL works using cURL
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $finalUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    // Masquerade a bit so we don't get 403 based on generic UA
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    $output = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    $len = strlen($output);
    echo "  - RESULTADO HTTP: $httpCode (Bytes: $len)\n\n";
}
