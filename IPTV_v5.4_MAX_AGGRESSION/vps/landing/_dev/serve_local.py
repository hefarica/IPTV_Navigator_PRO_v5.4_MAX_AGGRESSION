#!/usr/bin/env python3
"""[DEV ONLY — NO DESPLEGAR] Réplica local del snippet ape-landing.conf.

Por qué existe: en este host NO hay binario nginx (ni en Windows ni en WSL),
así que `nginx -t` y el comportamiento real de `map`/`if`+`return` no se pueden
ejecutar aquí (se declara NOT_RUN). Este servidor implementa la MISMA tabla de
decisión leyendo los MISMOS archivos de configuración del repo:

  * patrones UA  <- IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-landing-map.conf
  * content-types <- IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-landing.conf

Aproximación declarada: nginx usa PCRE (`~*`); aquí se usa `re` de Python, que
para estos patrones simples se comporta igual. NO es una prueba de nginx.

Uso:  python serve_local.py [puerto]     (por defecto 8099)
"""
from __future__ import annotations

import http.server
import pathlib
import re
import socketserver
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent      # .../vps/landing
SNIPPETS = ROOT.parent / "nginx" / "snippets"
CONF_MAP = SNIPPETS / "ape-landing-map.conf"
CONF_LOC = SNIPPETS / "ape-landing.conf"

PLAYER_MANIFEST = "/ape/landing/player-only/master.m3u8"
LANDING_FILE = ROOT / "index.html"
PLAYER_DIR = ROOT / "player-only"


def load_ua_rules(path: pathlib.Path) -> tuple[list[tuple[str, str]], str]:
    """Extrae (patrón, clase) y el default del bloque `map $http_user_agent`."""
    rules: list[tuple[str, str]] = []
    default = "browser"
    inside = False
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if re.match(r"^map\s+\$http_user_agent\s+\$ape_ua_class\s*\{", line):
            inside = True
            continue
        if inside and line == "}":
            break
        if not inside:
            continue
        m = re.match(r'^default\s+"([^"]+)"\s*;', line)
        if m:
            default = m.group(1)
            continue
        m = re.match(r'^"(~\*[^"]+)"\s+"([^"]+)"\s*;', line)
        if m:
            rules.append((m.group(1)[2:], m.group(2)))  # quita el prefijo `~*`
    return rules, default


def load_types(path: pathlib.Path) -> dict[str, str]:
    """Extrae {extensión: mime} de los bloques `types { ... }` del snippet."""
    types: dict[str, str] = {}
    inside = False
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if line.startswith("types") and line.endswith("{"):
            inside = True
            continue
        if inside and line == "}":
            inside = False
            continue
        if inside and line:
            parts = line.rstrip(";").split()
            if len(parts) == 2:
                types[parts[1]] = parts[0]
    return types


UA_RULES, UA_DEFAULT = load_ua_rules(CONF_MAP)
TYPES = load_types(CONF_LOC)


def classify(ua: str) -> str:
    for pattern, cls in UA_RULES:
        if re.search(pattern, ua, re.IGNORECASE):
            return cls
    return UA_DEFAULT


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "ape-landing-dev/1.0"

    def _common(self, status: int, cls: str) -> None:
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-APE-Landing", cls)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")

    def do_GET(self) -> None:  # noqa: N802 (API de http.server)
        path = urllib.parse.urlsplit(self.path).path
        ua = self.headers.get("User-Agent", "")
        cls = classify(ua)

        if path == "/ape/install":
            if cls == "player":
                self._common(302, "player")
                self.send_header("Location", PLAYER_MANIFEST)
                self.end_headers()
                print(f'UA={ua!r} class=player -> 302 {PLAYER_MANIFEST}')
                return
            body = LANDING_FILE.read_bytes()
            self._common(200, "browser")
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print(f"UA={ua!r} class=browser -> 200 text/html {len(body)} B")
            return

        if path.startswith("/ape/landing/player-only/"):
            name = path.rsplit("/", 1)[-1]
            candidate = (PLAYER_DIR / name).resolve()
            if not str(candidate).startswith(str(PLAYER_DIR.resolve())) or not candidate.is_file():
                self._common(404, "player-manifest")
                self.end_headers()
                return
            ext = candidate.suffix.lstrip(".").lower()
            ctype = TYPES.get(ext, "application/octet-stream")
            body = candidate.read_bytes()
            self._common(200, "player-manifest")
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print(f"GET {path} -> 200 {ctype} {len(body)} B")
            return

        self._common(404, "-")
        self.end_headers()
        print(f"GET {path} -> 404")

    def log_message(self, *_args) -> None:  # silencia el log por defecto
        return


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    if not UA_RULES:
        print("ERROR: no se pudo leer el map de UA", file=sys.stderr)
        return 2
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"ape-landing dev server en http://127.0.0.1:{port} "
              f"({len(UA_RULES)} reglas UA, {len(TYPES)} content-types)")
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
