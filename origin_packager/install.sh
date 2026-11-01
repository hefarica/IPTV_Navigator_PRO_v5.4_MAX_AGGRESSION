#!/usr/bin/env bash
# Install the packager on an AUTHORIZED origin host. Run as root.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${DEST:-/opt/ape-cmaf}"
OUT_DIR="${OUT_DIR:-/srv/ape-cmaf}"

command -v ffmpeg >/dev/null || { echo "ffmpeg required"; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe required"; exit 1; }
command -v nginx >/dev/null || { echo "nginx required"; exit 1; }

install -d -m 0755 "$DEST" "$OUT_DIR"
install -m 0755 "$HERE/packager.sh" "$DEST/packager.sh"
install -m 0755 "$HERE/healthcheck.sh" "$DEST/healthcheck.sh"
install -m 0644 "$HERE/nginx.conf" "/etc/nginx/conf.d/ape-cmaf.conf"
install -m 0644 "$HERE/ape-cmaf.service" "/etc/systemd/system/ape-cmaf.service"

if [[ ! -f /etc/ape-cmaf.env ]]; then
  install -m 0600 "$HERE/.env.example" /etc/ape-cmaf.env
  echo "Edit /etc/ape-cmaf.env with INPUT_URL before starting."
fi

systemctl daemon-reload
nginx -t
systemctl reload nginx
echo "Installed. Edit /etc/ape-cmaf.env, then: systemctl enable --now ape-cmaf"
