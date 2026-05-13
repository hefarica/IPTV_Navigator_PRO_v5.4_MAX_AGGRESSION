import sys
import json
import urllib.request
import urllib.error

def check_ipbinding():
    print("Iniciando validación de IP-Binding v5.4 L7...")
    targets = [
        "http://line.tivi-ott.net/",
        "http://126958958431.4k-26com.com"
    ]
    
    for t in targets:
        print(f"Probando {t}...")
        try:
            req = urllib.request.Request(t, headers={'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'})
            resp = urllib.request.urlopen(req, timeout=5)
            print(f" -> OK: {resp.status} (Sin IP Binding severo / Permitido)")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                print(f" -> DETECTADO: {e.code} IP-Binding Activo o Auth fallido. Requiere Hibridación 302.")
            else:
                print(f" -> ERROR HTTP Varios: {e.code}")
        except Exception as e:
            print(f" -> FALLÓ CONEXIÓN: {e}")

if __name__ == '__main__':
    check_ipbinding()
