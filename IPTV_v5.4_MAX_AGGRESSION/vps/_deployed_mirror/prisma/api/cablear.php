<?php
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
