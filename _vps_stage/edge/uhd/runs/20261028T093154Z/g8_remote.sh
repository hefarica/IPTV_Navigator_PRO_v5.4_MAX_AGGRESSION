set -u
echo '=== G8 LISTS BASELINE (read-only) ==='
echo "utc=$(date -u +%FT%TZ) host=$(hostname)"
for f in /var/www/lists/APE_LISTA_4K.m3u8.gz /var/www/lists/APE_LISTA_1793002539897_CDN.m3u8.gz; do
  echo "--- $f"
  if [ -e "$f" ]; then
    sha256sum "$f"
    stat -c '%n|%s|%a|%U:%G|%y' "$f"
  else
    echo ABSENT
  fi
done
echo '=== ls -lt /var/www/lists (top 5) ==='
ls -lt /var/www/lists 2>/dev/null | head -n 6
echo 'RESULT=OK'
