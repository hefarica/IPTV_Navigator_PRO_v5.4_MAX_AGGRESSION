set -u
echo "=== policy_deltas BEFORE (todas las DB posibles) ==="
DB=/var/www/html/prisma/db/conviva.db
ls -la "$DB" 2>&1
cat > /tmp/cnt.php <<'PHP'
<?php
$db=$argv[1];
if(!file_exists($db)){echo "NO_EXISTE $db\n";exit;}
try{
  $p=new PDO('sqlite:'.$db);
  $t=$p->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
  echo "tables=",implode(',',$t),"\n";
  if(in_array('policy_deltas',$t,true)){
    echo "policy_deltas_count=",$p->query("SELECT count(*) FROM policy_deltas")->fetchColumn(),"\n";
  } else { echo "policy_deltas_count=0 (tabla ausente)\n"; }
}catch(Throwable $e){ echo "ERR ",$e->getMessage(),"\n"; }
PHP
php /tmp/cnt.php "$DB" 2>&1
echo "--- tambien ape_devices.db y ape_lists.db (por completitud)"
php /tmp/cnt.php /var/www/html/prisma/db/ape_devices.db 2>&1
php /tmp/cnt.php /var/www/html/prisma/db/ape_lists.db 2>&1
rm -f /tmp/cnt.php
echo "BEFORE2_END"