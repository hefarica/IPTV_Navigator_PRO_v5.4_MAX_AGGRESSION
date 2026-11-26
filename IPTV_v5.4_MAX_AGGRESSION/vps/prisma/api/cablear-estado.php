<?php

/* [2026-11-19] CORS: el panel tambien se sirve en local (http://127.0.0.1:5500).
 * Sin esta cabecera el navegador bloquea la respuesta aunque el servidor conteste
 * 200. Se inserta DESPUES de declare(strict_types=1) cuando existe: declare debe
 * ser la PRIMERA sentencia del fichero o PHP aborta con fatal error. */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-APE-Token, X-Request-Profile');
/**
 * cablear-estado.php — ALIAS del path que fija el contrato t59 (§status_endpoint: GET /prisma/api/cablear-estado.php).
 *
 * La implementacion real vive en list-cablear-status.php. Dos paths, una sola
 * logica: este fichero solo la incluye.
 */
require __DIR__ . '/list-cablear-status.php';
