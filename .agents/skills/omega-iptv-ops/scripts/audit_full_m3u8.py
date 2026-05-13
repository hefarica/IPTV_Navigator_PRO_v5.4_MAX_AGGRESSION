import sys
import re

def audit_list(file_path):
    print(f"Iniciando Auditoría Forense OMEGA (Balanced Scorecard 120/120) en: {file_path}")
    score = 120
    penalties = []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if "#EXTM3U" not in content:
        penalties.append("-40: Falta #EXTM3U cabecera principal")
        score -= 40
        
    if "resolve_quality_unified.php" not in content:
        penalties.append("-20: No se está usando el SSOT unificado")
        score -= 20
        
    if "&mode=200ok" not in content:
        penalties.append("-30: Falta el parámetro inyectado de evasión (mode=200ok)")
        score -= 30
        
    if "fallback_proxy.php" in content and "token=" not in content:
        penalties.append("-15: Proxy Fallback expuesto sin HMAC Token")
        score -= 15
        
    print(f"Puntaje Final: {score}/120")
    if score == 120:
        print("✅ LISTA GOD-TIER. CUMPLIMIENTO OMEGA ABSOLUTO.")
    else:
        print("❌ FALLO DE AUDITORÍA. CORREGIR:")
        for p in penalties:
            print(p)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        audit_list(sys.argv[1])
    else:
        print("Uso: python audit_full_m3u8.py <archivo.m3u8>")
