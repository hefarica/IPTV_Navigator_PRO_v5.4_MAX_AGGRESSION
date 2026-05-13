import sys
import re
import os
import time

def process_m3u8(input_file, output_file):
    print(f"[+] Iniciando APE Artifact Killer v1.0")
    print(f"[+] Archivo Origen: {input_file}")
    print(f"[+] Archivo Destino: {output_file}")
    
    start_time = time.time()
    corrections = 0
    channels = 0
    
    # Pre-compilar expresiones regulares para máxima velocidad y seguridad in-place
    regex_alpha = re.compile(r'([\"\'\b]ALPHA[\"\']?\s*[:=]\s*)-2', re.IGNORECASE)
    regex_beta = re.compile(r'([\"\'\b]BETA[\"\']?\s*[:=]\s*)-2', re.IGNORECASE)
    regex_noise = re.compile(r'([\"\'\b]Noise-?Threshold[\"\']?\s*[:=]\s*)0\.02', re.IGNORECASE)
    regex_sharpen = re.compile(r'([\"\'\b]Sharpen-?Sigma[\"\']?\s*[:=]\s*)0\.03', re.IGNORECASE)
    regex_grain = re.compile(r'([\"\'\b]Grain-?Synthesis[\"\']?\s*[:=]\s*)(true|1)', re.IGNORECASE)
    regex_compression = re.compile(r'([\"\'\b]Compression-?Level[\"\']?\s*[:=]\s*)1', re.IGNORECASE)
    regex_rate_control = re.compile(r'([\"\'\b]Rate-?Control[\"\']?\s*[:=]\s*[\"\']?)VBR_CONSTRAINED([\"\']?)', re.IGNORECASE)
    
    with open(input_file, 'r', encoding='utf-8') as fin, \
         open(output_file, 'w', encoding='utf-8') as fout:
         
         for line in fin:
             original_line = line
             
             # Correcciones in-place
             line = regex_alpha.sub(r'\g<1>-4', line)
             line = regex_beta.sub(r'\g<1>-4', line)
             line = regex_noise.sub(r'\g<1>0.003', line)
             line = regex_sharpen.sub(r'\g<1>0.65', line)
             line = regex_grain.sub(r'\g<1>false', line)
             line = regex_compression.sub(r'\g<1>0', line)
             line = regex_rate_control.sub(r'\g<1>CRF\g<2>', line)
             
             if line != original_line:
                 corrections += 1

             # Escribir la línea original o corregida
             fout.write(line)
             
             # Inyección del Bloque Nuclear Inmediatamente después del EXTINF
             if line.startswith('#EXTINF:'):
                 channels += 1
                 fout.write('#EXT-X-APE-AK-RATE-CONTROL:CRF=0\n')
                 fout.write('#EXT-X-APE-AK-LOSSLESS-MODE:NEAR_LOSSLESS\n')
                 fout.write('#EXT-X-APE-AK-NOISE-ALGORITHM:NLMEANS+HQDN3D+BILATERAL\n')
                 fout.write('#EXT-X-APE-AK-ARTIFACT-REMOVAL:AI_INPAINTING+MOTION_VECTOR+FREQUENCY\n')
                 fout.write('#EXT-X-APE-AK-SHARPEN-TEXTURE:NEURAL_TEXTURE_V3\n')
                 fout.write('#EXT-X-APE-AK-AI-SR-MODEL:ESRGAN-4x+RealESRGAN-4x+HAT-L\n')

    elapsed = time.time() - start_time
    print(f"\n[✔] Ejecución completada con éxito en {elapsed:.2f} segundos.")
    print(f"    - Canales inyectados: {channels}")
    print(f"    - Correcciones de parámetros débiles aplicadas: {corrections}")
    print(f"    - Archivo parcheado generado: {output_file}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Uso: python ape_artifact_killer.py <ruta_al_archivo.m3u8>")
        sys.exit(1)
        
    in_file = sys.argv[1]
    
    # Construir ruta de salida inteligente
    base, ext = os.path.splitext(in_file)
    # Evitar duplicar el sufijo si ya existe
    if base.endswith('_ARTIFACT_KILLER'):
        out_file = in_file
    else:
        out_file = f"{base}_ARTIFACT_KILLER{ext}"
        
    process_m3u8(in_file, out_file)
