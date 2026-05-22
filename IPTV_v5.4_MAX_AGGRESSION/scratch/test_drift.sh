#!/system/bin/sh
is_new_manifest=${1:-0}

# Dump current settings to temporary files
settings list global > /data/local/tmp/.settings_global
settings list system > /data/local/tmp/.settings_system
settings list secure > /data/local/tmp/.settings_secure

awk -v is_new_manifest="$is_new_manifest" '
FILENAME ~ /\.settings_global$/ {
    idx = index($0, "=");
    if (idx > 0) {
        key = substr($0, 1, idx - 1);
        val = substr($0, idx + 1);
        global_settings[key] = val;
    }
    next;
}
FILENAME ~ /\.settings_system$/ {
    idx = index($0, "=");
    if (idx > 0) {
        key = substr($0, 1, idx - 1);
        val = substr($0, idx + 1);
        system_settings[key] = val;
    }
    next;
}
FILENAME ~ /\.settings_secure$/ {
    idx = index($0, "=");
    if (idx > 0) {
        key = substr($0, 1, idx - 1);
        val = substr($0, idx + 1);
        secure_settings[key] = val;
    }
    next;
}
FILENAME ~ /quality-manifest\.json$/ {
    if ($0 ~ /"ns":/) {
        ns = $0; gsub(/.*"ns":[[:space:]]*"/, "", ns); gsub(/",?.*/, "", ns);
    }
    if ($0 ~ /"key":/) {
        key = $0; gsub(/.*"key":[[:space:]]*"/, "", key); gsub(/",?.*/, "", key);
    }
    if ($0 ~ /"value":/) {
        val = $0; gsub(/.*"value":[[:space:]]*"/, "", val); gsub(/",?.*/, "", val);
        if (ns != "" && key != "") {
            current = "";
            found = 0;
            if (ns == "global" && (key in global_settings)) { current = global_settings[key]; found = 1; }
            else if (ns == "system" && (key in system_settings)) { current = system_settings[key]; found = 1; }
            else if (ns == "secure" && (key in secure_settings)) { current = secure_settings[key]; found = 1; }
            
            if (found && current != val) {
                # Exclude EDID peak_luminance clamp if not a new manifest from frontend
                if (is_new_manifest == 0 && key == "peak_luminance" && val == "10000" && current == "1000") {
                    # Skip
                } else {
                    print ns " " key " " val " " current;
                }
            }
            ns = ""; key = "";
        }
    }
}
' /data/local/tmp/.settings_global \
  /data/local/tmp/.settings_system \
  /data/local/tmp/.settings_secure \
  /data/local/tmp/quality-manifest.json

# Clean up temp files
rm -f /data/local/tmp/.settings_global /data/local/tmp/.settings_system /data/local/tmp/.settings_secure
