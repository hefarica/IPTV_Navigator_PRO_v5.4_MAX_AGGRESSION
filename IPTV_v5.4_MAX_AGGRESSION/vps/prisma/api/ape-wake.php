<?php
// ══════════════════════════════════════════════════════════════════════════
// APE — Wake beacon endpoint (encola wake; el worker despierta el daemon en ms)
// GET/POST /prisma/api/ape-wake.php?d=<deviceId>&c=<channelId>
// Fire-and-forget: responde 204 inmediatamente, escribe a /dev/shm/ape_wake_queue.
// NUNCA bloquea reproducción. No toca el stream. Idempotente (el worker dedup).
// ══════════════════════════════════════════════════════════════════════════
header("Cache-Control: no-store");
header("Access-Control-Allow-Origin: *");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

$dev = isset($_REQUEST["d"]) ? preg_replace('/[^A-Za-z0-9_.:\-]/', '', $_REQUEST["d"]) : "";
$ch  = isset($_REQUEST["c"]) ? preg_replace('/[^A-Za-z0-9_.:\-]/', '', $_REQUEST["c"]) : "";
$cip = $_SERVER["REMOTE_ADDR"] ?? "?";
if ($dev === "") { $dev = $cip; }

// Línea: ts<TAB>dev<TAB>ch<TAB>list<TAB>cip   (mismo formato que el Lua)
$line = sprintf("%d\t%s\t%s\t%s\t%s\n", time(), $dev, $ch, "beacon", $cip);
@file_put_contents("/dev/shm/ape_wake_queue", $line, FILE_APPEND | LOCK_EX);

http_response_code(204); // fire-and-forget, sin cuerpo
