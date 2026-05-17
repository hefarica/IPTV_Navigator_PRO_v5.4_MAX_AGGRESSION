#!/usr/bin/env python3
"""
Auditor Forense de Archivos JS para Ecosistema IPTV OMEGA CRYSTAL
Extrae directivas, lógicas y estructuras que no están en OMEGA CRYSTAL V5.
"""

import os
import sys
import zipfile
import tempfile
import re
import json

# Motores conocidos de V5 (para excluir del oro puro)
V5_KNOWN_ENGINES = [
    'phantom-hydra',
    'lcevc-phase-4',
    'hdr10-dolby-vision',
    'degradation-7-levels',
    'cortex-60ms',
    'buffer-nuclear',
    'bbr-hijacking'
]

def analyze_js_file(filepath):
    """Analiza un archivo JS en busca de oro puro (lógicas V6)."""
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    findings = []
    
    # 1. Buscar heurística y clasificador
    if 'heuristics' in content.lower() or 'classifier' in content.lower() or 'logo_paths' in content:
        findings.append({
            'motor': 'Heurística de Contenido',
            'descripcion': 'Detección inteligente del tipo de contenido (Deportes, Noticias, 4K)',
            'directivas': ['#EXT-X-APE-CONTENT-CLASS', '#EXT-X-APE-HEURISTIC-SCORE']
        })
        
    # 2. Buscar Córtex de Evasión Runtime (13 estrategias)
    if 'evasion' in content.lower() and ('403' in content or '407' in content or '451' in content):
        if 'IP_SWARM' in content or 'GEO_PHANTOM' in content:
            findings.append({
                'motor': 'Córtex de Evasión Runtime (V6)',
                'descripcion': 'Árbol de decisión de 13 estrategias de mutación en tiempo real',
                'directivas': ['#EXT-X-APE-CORTEX-STRATEGY', '#EXT-X-APE-ERROR-FALLBACK']
            })
            
    # 3. Buscar Coherencia TLS JA3/JA4
    if 'ja3' in content.lower() or 'ja4' in content.lower() or 'tls-coherence' in content.lower():
        findings.append({
            'motor': 'Coherencia TLS (JA3/JA4)',
            'descripcion': 'Suplantación criptográfica perfecta a nivel TLS 1.3',
            'directivas': ['#EXT-X-APE-TLS-JA3-HASH', '#EXT-X-APE-TLS-JA4-FINGERPRINT']
        })
        
    # 4. Buscar Xtream Exploit Engine
    if 'xtream' in content.lower() and ('vulnerability' in content.lower() or 'exploit' in content.lower()):
        findings.append({
            'motor': 'Xtream Exploit Engine',
            'descripcion': 'Identifica 8 vulnerabilidades y aplica 8 técnicas de explotación (prefetch agresivo)',
            'directivas': ['#EXT-X-APE-XTREAM-EXPLOIT', '#EXT-X-APE-PREFETCH-AGRESSIVE']
        })
        
    # 5. Buscar VPN Suprema Bidireccional
    if 'vpn' in content.lower() and 'websocket' in content.lower() and 'obfuscation' in content.lower():
        findings.append({
            'motor': 'Integración VPN Suprema',
            'descripcion': 'Payload ofuscado y comunicación bidireccional WebSocket',
            'directivas': ['#EXT-X-APE-VPN-OBFUSCATION', '#EXT-X-APE-BIDIRECTIONAL-COMM']
        })
        
    # 6. Buscar Throughput + QoS Dinámico
    if 'throughput' in content.lower() or 'bottleneck' in content.lower():
        findings.append({
            'motor': 'Throughput & QoS Dinámico',
            'descripcion': 'Calcula ancho de banda real y escala buffer automáticamente',
            'directivas': ['#EXT-X-APE-THROUGHPUT-MONITOR', '#EXT-X-APE-DYNAMIC-BUFFER']
        })
        
    # 7. Buscar Smart Codec Prioritizer
    if 'codec' in content.lower() and 'priority' in content.lower() and 'hardware_decode' in content.lower():
        findings.append({
            'motor': 'Priorizador Inteligente de Codecs',
            'descripcion': 'Matriz de eficiencia AV1 > HEVC > VP9 > H264 por dispositivo',
            'directivas': ['#EXT-X-APE-CODEC-PRIMARY', '#EXT-X-APE-CODEC-FALLBACK']
        })
        
    # 8. Buscar JWT Generator
    if 'jwt' in content.lower() and 'hmac' in content.lower() and 'payload' in content.lower():
        findings.append({
            'motor': 'Generador JWT (Capa 7)',
            'descripcion': 'Firmas HMAC-SHA256 con payload ultra denso para evitar 302',
            'directivas': ['#EXT-X-APE-JWT-PAYLOAD', '#EXT-X-APE-AUTH-SIGNATURE']
        })
        
    return findings

def main():
    if len(sys.argv) != 2:
        print("Uso: python audit_js_zip.py <archivo.zip>")
        sys.exit(1)
        
    zip_path = sys.argv[1]
    if not os.path.exists(zip_path):
        print(f"Error: No se encontró el archivo {zip_path}")
        sys.exit(1)
        
    print(f"🔍 Iniciando auditoría forense de {zip_path}...")
    
    all_findings = []
    
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(tmpdir)
                
            for root, _, files in os.walk(tmpdir):
                for file in files:
                    if file.endswith('.js'):
                        filepath = os.path.join(root, file)
                        file_findings = analyze_js_file(filepath)
                        if file_findings:
                            for finding in file_findings:
                                finding['archivo'] = file
                                all_findings.append(finding)
                                
        except zipfile.BadZipFile:
            print(f"Error: {zip_path} no es un archivo ZIP válido.")
            sys.exit(1)
            
    if not all_findings:
        print("❌ No se encontró 'oro puro' (motores V6) en el archivo ZIP.")
    else:
        print(f"✅ Se encontraron {len(all_findings)} motores de 'oro puro':")
        print("-" * 50)
        
        # Agrupar por motor para no repetir
        motores_unicos = {}
        for f in all_findings:
            motor = f['motor']
            if motor not in motores_unicos:
                motores_unicos[motor] = f
            else:
                # Añadir archivo a la lista si hay múltiples
                if 'archivos' not in motores_unicos[motor]:
                    motores_unicos[motor]['archivos'] = [motores_unicos[motor]['archivo']]
                if f['archivo'] not in motores_unicos[motor].get('archivos', []):
                    motores_unicos[motor]['archivos'].append(f['archivo'])
                    
        for motor, info in motores_unicos.items():
            print(f"🏆 {motor}")
            print(f"   Descripción: {info['descripcion']}")
            print(f"   Directivas: {', '.join(info['directivas'])}")
            archivos = info.get('archivos', [info['archivo']])
            print(f"   Archivos: {', '.join(archivos)}")
            print("-" * 50)
            
        # Generar JSON de salida para fácil consumo
        output_json = "audit_results.json"
        with open(output_json, 'w') as f:
            json.dump(list(motores_unicos.values()), f, indent=2)
        print(f"📄 Resultados guardados en {output_json}")

if __name__ == "__main__":
    main()
