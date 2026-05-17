import sys
import re

def audit_structure(file_path):
    print(f"Iniciando Auditoría Estructural v10.4 (RFC 8216) en: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    errors = 0
    in_channel = False
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line: continue
        
        if line.startswith("#EXTINF:"):
            in_channel = True
            
        if line.startswith("http") and in_channel:
            in_channel = False # Fin del bloque del canal
            
            # Chequeos estructurales previos al link
            prev_lines = "".join(lines[max(0, i-6):i])
            if "#EXT-X-APE-FALLBACK-DIRECT" not in prev_lines:
                print(f"Línea {i+1}: Advertencia - Falta directive FALLBACK-DIRECT.")
                errors += 1
                
    if errors == 0:
        print("✅ Estructura CANÓNICA intacta. No hay infracciones v10.4.")
    else:
        print(f"⚠️ {errors} violaciones estructurales encontradas.")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        audit_structure(sys.argv[1])
    else:
        print("Uso: python audit_structure_v10.py <archivo.m3u8>")
