"""
VERIFICADOR DE COMPATIBILIDAD CON REPRODUCTORES

Valida que el archivo M3U8 sea compatible con los reproductores más populares:
- VLC Media Player
- Kodi/XBMC
- Smart TV (Samsung, LG, Sony)
- Reproductores IPTV estándar
- Android TV
"""

import sys
import re

class CompatibilityChecker:
    def __init__(self, filepath):
        self.filepath = filepath
        self.results = {}
        self.lines = []

    def read_file(self):
        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                self.lines = f.readlines()
            return True
        except Exception as e:
            print(f"❌ Error al leer archivo: {e}")
            return False

    def check_vlc_compatibility(self):
        """Verifica compatibilidad con VLC Media Player"""
        checks = {
            'EXTINF': False,
            'EXTVLCOPT': False,
            'URL_format': False,
            'UTF8_encoding': False
        }

        for line in self.lines:
            if '#EXTINF' in line:
                checks['EXTINF'] = True
            if '#EXTVLCOPT' in line:
                checks['EXTVLCOPT'] = True
            if line.startswith('http'):
                checks['URL_format'] = True

        # Verificar UTF-8
        try:
            ''.join(self.lines).encode('utf-8')
            checks['UTF8_encoding'] = True
        except:
            pass

        passed = all(checks.values())
        self.results['VLC'] = {'passed': passed, 'checks': checks}
        return passed

    def check_kodi_compatibility(self):
        """Verifica compatibilidad con Kodi/XBMC"""
        checks = {
            'KODIPROP': False,
            'EXTINF': False,
            'URL_format': False
        }

        for line in self.lines:
            if '#KODIPROP' in line:
                checks['KODIPROP'] = True
            if '#EXTINF' in line:
                checks['EXTINF'] = True
            if line.startswith('http'):
                checks['URL_format'] = True

        passed = checks['EXTINF'] and checks['URL_format']
        self.results['Kodi'] = {'passed': passed, 'checks': checks}
        return passed

    def check_smarttv_compatibility(self):
        """Verifica compatibilidad con Smart TV"""
        checks = {
            'M3U_format': False,
            'EXTINF': False,
            'URL_format': False,
            'Logo_support': False
        }

        for line in self.lines:
            if '#EXTM3U' in line:
                checks['M3U_format'] = True
            if '#EXTINF' in line:
                checks['EXTINF'] = True
                if 'tvg-logo=' in line:
                    checks['Logo_support'] = True
            if line.startswith('http'):
                checks['URL_format'] = True

        passed = all(checks.values())
        self.results['SmartTV'] = {'passed': passed, 'checks': checks}
        return passed

    def check_iptv_standard_compatibility(self):
        """Verifica compatibilidad con reproductores IPTV estándar"""
        checks = {
            'HLS_format': False,
            'JWT_in_url': False,
            'No_pipe_in_url': False,
            'Valid_URLs': False
        }

        pipe_count = 0
        jwt_count = 0
        valid_url_count = 0

        for line in self.lines:
            if line.startswith('http'):
                valid_url_count += 1
                if '|' in line:
                    pipe_count += 1
                if 'ape_jwt=' in line:
                    jwt_count += 1

        checks['HLS_format'] = '#EXTM3U' in ''.join(self.lines)
        checks['JWT_in_url'] = jwt_count > 0
        checks['No_pipe_in_url'] = pipe_count == 0
        checks['Valid_URLs'] = valid_url_count > 0

        passed = all(checks.values())
        self.results['IPTV_Standard'] = {'passed': passed, 'checks': checks}
        return passed

    def check_android_tv_compatibility(self):
        """Verifica compatibilidad con Android TV"""
        checks = {
            'UTF8': False,
            'EXTINF': False,
            'URL_format': False,
            'No_special_chars': False
        }

        try:
            ''.join(self.lines).encode('utf-8')
            checks['UTF8'] = True
        except:
            pass

        for line in self.lines:
            if '#EXTINF' in line:
                checks['EXTINF'] = True
            if line.startswith('http'):
                checks['URL_format'] = True

        # Verificar caracteres especiales problemáticos
        problematic_chars = ['|', '<', '>', '"', "'"]
        has_problematic = False
        for line in self.lines:
            if line.startswith('http'):
                for char in problematic_chars:
                    if char in line:
                        has_problematic = True
                        break

        checks['No_special_chars'] = not has_problematic

        passed = all(checks.values())
        self.results['AndroidTV'] = {'passed': passed, 'checks': checks}
        return passed

    def run_all_checks(self):
        print("="*80)
        print("VERIFICADOR DE COMPATIBILIDAD CON REPRODUCTORES")
        print("="*80)

        if not self.read_file():
            return

        print(f"\n📊 Archivo: {self.filepath}")
        print(f"📝 Líneas: {len(self.lines)}\n")

        print("Ejecutando pruebas de compatibilidad...\n")

        self.check_vlc_compatibility()
        self.check_kodi_compatibility()
        self.check_smarttv_compatibility()
        self.check_iptv_standard_compatibility()
        self.check_android_tv_compatibility()

        self.print_results()

    def print_results(self):
        print("="*80)
        print("RESULTADOS DE COMPATIBILIDAD")
        print("="*80)

        reproductores = {
            'VLC': '📺 VLC Media Player',
            'Kodi': '📺 Kodi/XBMC',
            'SmartTV': '📺 Smart TV (Samsung, LG, Sony)',
            'IPTV_Standard': '📺 Reproductores IPTV Estándar',
            'AndroidTV': '📺 Android TV'
        }

        all_compatible = True

        for key, name in reproductores.items():
            result = self.results[key]
            status = "✅ COMPATIBLE" if result['passed'] else "❌ NO COMPATIBLE"
            print(f"\n{name}")
            print(f"  Estado: {status}")

            if not result['passed']:
                all_compatible = False
                print(f"  Detalles:")
                for check_name, check_result in result['checks'].items():
                    check_status = "✅" if check_result else "❌"
                    print(f"    {check_status} {check_name}")

        print("\n" + "="*80)
        if all_compatible:
            print("🎉 ¡EXCELENTE! El archivo es 100% compatible con todos los reproductores.")
        else:
            print("⚠️ ATENCIÓN: El archivo tiene problemas de compatibilidad con algunos reproductores.")
        print("="*80)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python compatibility_checker.py <ruta_del_archivo.m3u8>")
        sys.exit(1)

    filepath = sys.argv[1]
    checker = CompatibilityChecker(filepath)
    checker.run_all_checks()

