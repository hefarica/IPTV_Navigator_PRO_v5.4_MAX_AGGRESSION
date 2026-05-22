#!/system/bin/sh
awk '
/"ns":/ {
    ns = $0;
    gsub(/.*"ns":[[:space:]]*"/, "", ns);
    gsub(/",?.*/, "", ns);
}
/"key":/ {
    key = $0;
    gsub(/.*"key":[[:space:]]*"/, "", key);
    gsub(/",?.*/, "", key);
}
/"value":/ {
    val = $0;
    gsub(/.*"value":[[:space:]]*"/, "", val);
    gsub(/",?.*/, "", val);
    if (ns != "" && key != "") {
        print ns " " key " " val;
        ns = "";
        key = "";
    }
}
' /data/local/tmp/quality-manifest.json
