'''
VALIDADOR DE ARQUITECTURA v4 M3U8

Este script realiza 3 pruebas críticas para verificar la correcta implementación de la arquitectura v4:
1.  **Line Count Test**: Verifica que cada canal tenga exactamente 237 líneas.
2.  **URL Validity Test**: Asegura que las URLs contengan `ape_jwt` y CERO caracteres de pipe (`|`).
3.  **Tag Verification**: Confirma que los 8 módulos de mejoras estén presentes en la sección `EXT-X-APE`.
'''
import sys
import re

class V4Validator:
    def __init__(self, filepath):
        self.filepath = filepath
        self.lines = []
        self.results = {}
        self.channel_blocks = []

    def _read_file(self):
        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                self.lines = f.readlines()
            return True
        except FileNotFoundError:
            self.results['error'] = f"Archivo no encontrado: {self.filepath}"
            return False

    def _segment_channels(self):
        extinf_indices = [i for i, line in enumerate(self.lines) if line.startswith('#EXTINF')]
        if not extinf_indices:
            self.results['error'] = "No se encontraron canales (#EXTINF) en el archivo."
            return

        for i in range(len(extinf_indices)):
            start_index = extinf_indices[i]
            end_index = extinf_indices[i+1] if i + 1 < len(extinf_indices) else len(self.lines)
            self.channel_blocks.append(self.lines[start_index:end_index])

    def run_all_tests(self):
        print("="*80)
        print("INICIANDO VALIDACIÓN DE ARQUITECTURA v4")
        print("="*80)

        if not self._read_file():
            print(f"❌ ERROR: {self.results['error']}", file=sys.stderr)
            return

        self._segment_channels()
        if not self.channel_blocks:
            print(f"❌ ERROR: {self.results.get('error', 'No se pudieron segmentar los canales.')}", file=sys.stderr)
            return

        print(f"📊 Canales encontrados: {len(self.channel_blocks)}\n")

        self.test_line_count()
        self.test_url_validity()
        self.test_tag_verification()
        self.print_summary()

    def test_line_count(self):
        print("--- 1. Prueba de Conteo de Líneas (Line Count Test) ---")
        errors = []
        for i, block in enumerate(self.channel_blocks):
            # Quitamos líneas en blanco al final del bloque
            clean_block = [line for line in block if line.strip()]
            line_count = len(clean_block)
            if line_count != 237:
                errors.append(f"Canal #{i+1}: Se esperaban 237 líneas, pero se encontraron {line_count}.")
        
        self.results['line_count'] = {'passed': not errors, 'errors': errors}
        status = "✅ PASÓ" if not errors else "❌ FALLÓ"
        print(f"Resultado: {status}\n")

    def test_url_validity(self):
        print("--- 2. Prueba de Validez de URL (URL Validity Test) ---")
        errors = []
        for i, block in enumerate(self.channel_blocks):
            url_line = None
            for line in block:
                if line.strip().startswith('http'):
                    url_line = line.strip()
                    break
            
            if not url_line:
                errors.append(f"Canal #{i+1}: No se encontró ninguna URL.")
                continue

            if '|' in url_line:
                errors.append(f"Canal #{i+1}: La URL contiene un carácter de pipe (`|`). URL: {url_line[:100]}...")
            if 'ape_jwt=' not in url_line:
                errors.append(f"Canal #{i+1}: La URL no contiene el parámetro `ape_jwt=`.")

        self.results['url_validity'] = {'passed': not errors, 'errors': errors}
        status = "✅ PASÓ" if not errors else "❌ FALLÓ"
        print(f"Resultado: {status}\n")

    def test_tag_verification(self):
        print("--- 3. Prueba de Verificación de Tags (Tag Verification) ---")
        required_tags = {
            'Evasion 407': '#EXT-X-APE-407-EVASION-ENABLED',
            'VPN Integration': '#EXT-X-APE-VPN-DETECTION',
            'Buffer Adaptativo': '#EXT-X-APE-BUFFER-ADAPTIVE-ENABLED',
            'Latencia Rayo': '#EXT-X-APE-LATENCY-OPTIMIZATION',
            'Smart Codec': '#EXT-X-APE-CODEC-SELECTION-METHOD',
            'Prefetch Paralelo': '#EXT-X-APE-PREFETCH-STRATEGY',
            'Optimización Ancho de Banda': '#EXT-X-APE-CONGESTION-DETECTION',
            'Recuperación Instantánea': '#EXT-X-APE-INSTANT-RECOVERY'
        }
        errors = []
        for i, block in enumerate(self.channel_blocks):
            block_content = "".join(block)
            missing_tags = []
            for name, tag in required_tags.items():
                if tag not in block_content:
                    missing_tags.append(name)
            
            if missing_tags:
                errors.append(f"Canal #{i+1}: Faltan los siguientes grupos de tags: {', '.join(missing_tags)}")

        self.results['tag_verification'] = {'passed': not errors, 'errors': errors}
        status = "✅ PASÓ" if not errors else "❌ FALLÓ"
        print(f"Resultado: {status}\n")

    def print_summary(self):
        print("="*80)
        print("RESUMEN DE VALIDACIÓN")
        print("="*80)
        
        all_passed = True
        for test_name, result in self.results.items():
            if test_name == 'error': continue
            status = "✅ PASÓ" if result['passed'] else "❌ FALLÓ"
            print(f"- {test_name.replace('_', ' ').title()}: {status}")
            if not result['passed']:
                all_passed = False
                for error in result['errors'][:3]: # Imprimir hasta 3 errores por prueba
                    print(f"  - {error}")
        
        print("-" * 80)
        if all_passed:
            print("🎉 ¡FELICIDADES! El archivo cumple con toda la especificación de la arquitectura v4.")
        else:
            print("⚠️ ATENCIÓN: El archivo NO cumple con la especificación de la arquitectura v4.")
        print("="*80)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python v4_validator.py <ruta_del_archivo.m3u8>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    validator = V4Validator(filepath)
    validator.run_all_tests()
