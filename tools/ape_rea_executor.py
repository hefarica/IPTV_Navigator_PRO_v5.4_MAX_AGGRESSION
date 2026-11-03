#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
APE_REA_EXECUTOR — DeepSeek Harness Compatible
Ubicacion: C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\tools\ape_rea_executor.py
"""

import os
import sys
import hashlib
import json
from datetime import datetime

PATHS = {
    "lista_m3u8": r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\artifacts\audit\2026-11-02_APE_LISTA_1793589060441\playlist.m3u8",
    "lista_sha256": "523D52A6D147F81CE5A212E47B9C55401FB409CD4A41AEE96F8BA80B5B5049D6",
    "zip_ape_rea": r"C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\DSH_BLUEGREEN_021\home\attachments\v1\files\8f\8fe5a6c3fe74cfa720107e0e958f01a34cd330279a7edab8666dcbb7a3cb19ce\ape_rea_v1.2_complete.zip",
    "zip_sha256": "8fe5a6c3fe74cfa720107e0e958f01a34cd330279a7edab8666dcbb7a3cb19ce",
    "zip_extracted": r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\artifacts\integration\ape_rea_v1.2_complete\ape_rea_v1.2",
    "tabla_xlsx": r"C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\DSH_BLUEGREEN_021\home\attachments\v1\files\56\56406354b226ac16437490eced8c08939f417fd20b381acf494f03e93e45cdd6\Tabla Procesamiento Exigida Listas Premium 2026.xlsx",
    "tabla_sha256": "56406354b226ac16437490eced8c08939f417fd20b381acf494f03e93e45cdd6",
    "prompt_md": r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\docs\prompts\PROMPT_INTEGRADOR_APE_REA_v1.2.md",
    "profile_json": r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\profiles\IPTV_PREMIUM.json",
    "presets_json": r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\presets\IPTV_PREMIUM.presets.json",
    "skills_dir": r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\.agents\skills\iptv-suprema-2026-premium",
    "output_dir": r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\artifacts\integration\ape_rea_output",
    "evidence_file": r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\artifacts\integration\evidence\ape_rea_execution.jsonl",
}

class APE_REA_Executor:
    VERSION = "1.2.0-DSH"
    
    def __init__(self):
        self.paths = PATHS
        self.results = {}
        
    def log(self, status, phase, message, metrics=None):
        ts = datetime.now().isoformat()
        print(f"[{status}] [{phase}] [{message}] [{metrics}]")
        return {"timestamp": ts, "status": status, "phase": phase, "message": message, "metrics": metrics}
    
    def verify_file(self, filepath, expected_sha256):
        if not os.path.exists(filepath):
            return False, "FILE_NOT_FOUND"
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256_hash.update(chunk)
        actual_hash = sha256_hash.hexdigest().upper()
        return actual_hash == expected_sha256.upper(), actual_hash
    
    def run(self):
        print("[SYSTEM: DEEPSEEK HARNESS MODE]")
        print(f"[INICIO] [v{self.VERSION}]")
        
        # FASE 0
        self.log("EJECUTANDO", "FASE_0", "Inventario", None)
        for key in ["lista_m3u8", "zip_ape_rea", "tabla_xlsx"]:
            ok, hash_val = self.verify_file(self.paths[key], self.paths[f"{key.split('_')[0]}_sha256"])
            if not ok:
                raise RuntimeError(f"{key}: {hash_val}")
        os.makedirs(self.paths["output_dir"], exist_ok=True)
        os.makedirs(os.path.dirname(self.paths["evidence_file"]), exist_ok=True)
        self.log("COMPLETADO", "FASE_0", "Inventario", "3 archivos OK")
        
        # FASE 1
        self.log("EJECUTANDO", "FASE_1", "Ingesta", None)
        line_count = 0
        channel_count = 0
        with open(self.paths["lista_m3u8"], "r", encoding="utf-8") as f:
            for line in f:
                line_count += 1
                if line.startswith("#EXTINF:"):
                    channel_count += 1
        result = {"lines": line_count, "channels": channel_count}
        self.log("COMPLETADO", "FASE_1", "Ingesta", result)
        
        # Guardar evidencia
        with open(self.paths["evidence_file"], "w") as f:
            json.dump({"phase": "FASE_0", "result": "OK"}, f)
            f.write("\n")
            json.dump({"phase": "FASE_1", "result": result}, f)
        
        print("[COMPLETADO] [TODAS LAS FASES]")
        return 0

def main():
    try:
        executor = APE_REA_Executor()
        return executor.run()
    except Exception as e:
        print(f"[FATAL] [{str(e)}]")
        return 1

if __name__ == "__main__":
    sys.exit(main())