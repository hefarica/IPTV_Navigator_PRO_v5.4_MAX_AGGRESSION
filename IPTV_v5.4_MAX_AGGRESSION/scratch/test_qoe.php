<?php
declare(strict_types=1);

require_once '/var/www/html/prisma/lib/conviva_persistence.php';

$p = new ConvivaPersistence();
$rows = $p->readServerSideQoESnapshot();
var_dump($rows);
