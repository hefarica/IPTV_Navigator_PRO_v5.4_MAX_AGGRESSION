<?php

/* [2026-11-19] CORS: el panel tambien se sirve en local (http://127.0.0.1:5500).
 * Sin esta cabecera el navegador bloquea la respuesta aunque el servidor conteste
 * 200. Se inserta DESPUES de declare(strict_types=1) cuando existe: declare debe
 * ser la PRIMERA sentencia del fichero o PHP aborta con fatal error. */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-APE-Token, X-Request-Profile');
/**
 * cablear.php — ALIAS del path que fija el contrato t59 (§enqueue_endpoint: POST /prisma/api/cablear.php).
 *
 * POR QUE EXISTEN DOS PATHS: el contrato (autoridad del operador) fija
 * /prisma/api/cablear.php, y el encargo de implementacion nombra el fichero
 * list-cablear.php junto a list-activate.php. Servir los dos evita elegir entre
 * romper el contrato o romper la convencion del directorio: la implementacion
 * real vive una sola vez (list-cablear.php) y este fichero la incluye. Cero
 * logica duplicada, cero divergencia posible.
 */
require __DIR__ . '/list-cablear.php';
