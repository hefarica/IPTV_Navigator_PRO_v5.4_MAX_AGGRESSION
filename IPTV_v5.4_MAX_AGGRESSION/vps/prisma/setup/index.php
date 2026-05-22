<?php
// APE Setup Smart Download — /prisma/setup/
// Returns appropriate installer based on User-Agent
$ua = $_SERVER["HTTP_USER_AGENT"] ?? "";
$action = $_GET["action"] ?? "download";

// Windows → PS1 script
if (stripos($ua,"Windows") !== false || isset($_GET["win"])) {
    header("Content-Type: application/octet-stream");
    header("Content-Disposition: attachment; filename=\"APE_Setup_Kit.ps1\"");
    readfile("/var/www/html/prisma/setup/APE_Setup_Kit.ps1");
    exit;
}

// Android / curl → shell script
if (stripos($ua,"Android") !== false || stripos($ua,"curl") !== false || isset($_GET["android"])) {
    header("Content-Type: application/octet-stream");
    header("Content-Disposition: attachment; filename=\"ape-android-setup.sh\"");
    readfile("/var/www/html/prisma/setup/ape-android-setup.sh");
    exit;
}

// Default → HTML landing page with download links
http_response_code(200);
header("Content-Type: text/html; charset=utf-8");
?><!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>APE UHDX Setup Kit</title>
<style>body{font-family:monospace;background:#0a0a0a;color:#e0e0e0;max-width:700px;margin:40px auto;padding:20px}
h1{color:#00ff88}a.btn{display:inline-block;margin:10px 8px;padding:12px 24px;background:#1a3a2a;border:1px solid #00ff88;color:#00ff88;text-decoration:none;border-radius:4px}
a.btn:hover{background:#00ff88;color:#000}pre{background:#111;padding:16px;border-left:3px solid #00ff88;overflow-x:auto}</style>
</head>
<body>
<h1>APE UHDX Setup Kit</h1>
<p>Instalador automático: detecta dispositivo Android, aplica 51 settings ADB, instala sentinel + chisel, registra en VPS.</p>
<a class="btn" href="?win=1">⬇ Windows (.ps1)</a>
<a class="btn" href="?android=1">⬇ Android (.sh via ADB)</a>
<hr>
<h3>Instalación rápida Windows</h3>
<pre>irm https://iptv-ape.duckdns.org/prisma/setup/ | iex</pre>
<h3>Instalación via ADB (desde PC)</h3>
<pre>curl -s https://iptv-ape.duckdns.org/prisma/setup/?android=1 | adb -s DEVICE:5555 shell</pre>
<p style="color:#888;font-size:12px">APE UHDX v6.0 — IPTV Navigator PRO v5.4 MAX AGGRESSION</p>
</body></html>
<?php
