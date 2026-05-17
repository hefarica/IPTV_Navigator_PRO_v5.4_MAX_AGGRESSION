import sys
import hmac
import hashlib
import urllib.parse
import base64

# Simulación segura de enmascaramiento basada en el SSOT de OMEGA
FALLBACK_SECRET = "OMEGA_GOD_TIER_KEY_2026_V5" # Clave del servidor (mockup de skill local)

def mask_url(url):
    print(f"Enmascarando URL de Origen: {url}")
    # Creando firma SHA256
    encoded_url = urllib.parse.quote(url)
    h = hmac.new(FALLBACK_SECRET.encode(), encoded_url.encode(), hashlib.sha256)
    token = h.hexdigest()
    
    masked_url = f"https://iptv-ape.duckdns.org/fallback_proxy.php?url={encoded_url}&token={token}"
    
    print("\n✅ URL Blindada con HMAC-SHA256:")
    print(masked_url)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        mask_url(sys.argv[1])
    else:
        print("Uso: python mask_fallback_direct.py <URL>")
