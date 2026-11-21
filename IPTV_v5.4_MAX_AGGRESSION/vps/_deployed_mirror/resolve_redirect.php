<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, x-playback-session-id, x-ape-signature, ape-security-token, x-request-profile');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
$url = $_GET['url'] ?? '';
$ch = curl_init($url);
curl_setopt_array($ch, [CURLOPT_FOLLOWLOCATION => false, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5]);
curl_exec($ch);
$info = curl_getinfo($ch);
echo json_encode(['location' => $info['redirect_url'] ?: $url, 'status' => $info['http_code']]);
