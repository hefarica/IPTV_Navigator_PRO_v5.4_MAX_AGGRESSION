<?php
header('Content-Type: text/html; charset=utf-8');
$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$isTv = (bool)preg_match('/Android TV|BRAVIA|FireTV|AFT|onn|MiBOX|Chromecast/i', $ua);
$isAndroid = (bool)preg_match('/Android/i', $ua);
$apk = '/ara/pack/ape-crystal-agent-675.apk';
$size = @filesize(__DIR__ . '/ape-crystal-agent-675.apk');
?><!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>APE CRYSTAL FLOW — Provision</title>
<style>
body{font-family:system-ui,Arial;background:#0b0f14;color:#d7e3ee;margin:0;padding:24px;line-height:1.55}
h1{font-size:22px;color:#5ee7a0}h2{font-size:16px;color:#7cc4ff;margin-top:26px}
a.b{display:block;background:#16794a;color:#fff;text-align:center;padding:18px;border-radius:10px;font-size:18px;font-weight:700;text-decoration:none;margin:18px 0}
code,.m{background:#121a23;padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace;font-size:13px;word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #1d2836;padding:7px;text-align:left;vertical-align:top}
.w{background:#2a1e00;border-left:3px solid #d9a400;padding:12px;border-radius:6px;font-size:13px}
</style>
<h1>APE CRYSTAL FLOW · Provision</h1>
<p class="m">device detectado: <?= htmlspecialchars($ip) ?><br>UA: <?= htmlspecialchars(substr($ua,0,110)) ?></p>
<?php if ($isTv): ?><p><b>Detectado: Android TV / Fire TV.</b> Descarga e instala; el lanzador LEANBACK lo mostrará.</p><?php
elseif ($isAndroid): ?><p><b>Detectado: Android.</b> Permite "instalar apps de origen desconocido" para el navegador/descargador.</p>
<?php else: ?><p>Descarga el APK y cópialo al device por USB, o usa <code>adb install -r</code>.</p><?php endif; ?>
<a class="b" href="<?= $apk ?>">⬇ Descargar APE Crystal Agent 675 (<?= round(($size?:24029140)/1048576,1) ?> MB)</a>
<h2>Instalación</h2>
<table>
<tr><th>Device</th><th>Pasos</th></tr>
<tr><td>ONN 4K / Fire TV</td><td>Ajustes → Aplicaciones → Instalar apps desconocidas → permitir al descargador. Abrir el link, instalar, abrir la app una vez.</td></tr>
<tr><td>Cualquier Android</td><td>Instalar el APK. Abrir la app: se registra, sincroniza y se auto-actualiza desde <code>/ara/version.json</code>.</td></tr>
<tr><td>Con adb (host autorizado)</td><td><code>adb connect &lt;ip&gt;:5555 &amp;&amp; adb install -r ape-crystal-agent-675.apk</code><br>o <code>node tools/ape-bootstrap-device.js --pipeline &lt;ip&gt;:5555</code> (verifica sha antes y después)</td></tr>
</table>
<h2>Después de instalar</h2>
<table>
<tr><td>Registro/telemetría</td><td><code>/ara/enroll</code> → <code>/ara/state</code> → <code>/ara/events</code></td></tr>
<tr><td>Auto-actualización</td><td><code>/ara/version.json</code> + <code>/ara/agent.apk</code></td></tr>
<tr><td>Contrato QoE</td><td>tag <code>#EXT-X-APE-QOE-CONTRACT</code> en el cuerpo de <code>/pulse</code></td></tr>
</table>
<div class="w"><b>Límite honesto:</b> Android no instala software desde una URL sin intervención. Este link <b>descarga</b>; la instalación requiere un toque en el prompt, o <b>adb</code></b> desde un host autorizado, o que el device sea <i>Device Owner</i>. No existe instalación silenciosa legítima en un device nuevo.</div>
<h2>Integridad del paquete</h2>
<p><a href="/ara/pack/sha256.txt">sha256.txt</a> · <a href="/ara/pack/pack.json">pack.json</a> · APK sha256 <code>9bded476be0ec7a23eeceee965013d9b19410c84f6b2c37433c65aeabc4d8d6f</code></p>
<p style="opacity:.6;font-size:12px">APE CRYSTAL FLOW · pack generado <?= date('c') ?></p>
</html>
