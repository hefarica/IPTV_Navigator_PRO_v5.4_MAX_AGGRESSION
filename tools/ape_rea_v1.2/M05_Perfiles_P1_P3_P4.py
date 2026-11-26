#!/usr/bin/env python3
"""APE REA v1.2 — M05 PERFILES — Fase 5: P1/P3/P4 con D5/D7"""

class M05Perfiles:
    VERSION = "1.2.0"
    TIERS = {"T0": {"res": "7680x4320"}, "T1.5": {"res": "5760x3240"}, "T2": {"res": "3840x2160"}}
    PERFILES = {"P1": {"ops": []}, "P3": {"ops": ["upscale"]}, "P4": {"ops": ["realesrgan", "rife"]}}
    D5 = {"capas": ["Fútbol", "F1"], "memc": "sport"}
    D7 = {"fps": 50, "conservacion_temporal": True}
    
    def validate(self, p: str, t: str) -> bool: return p in self.PERFILES and t in self.TIERS
    def resolve(self, p: str, t: str) -> dict: return {"perfil": self.PERFILES.get(p), "tier": self.TIERS.get(t)}
    def apply(self, p: str, t: str, receta: str = "D3") -> dict:
        cfg = self.TIERS[t].copy()
        cfg["perfil"] = p
        cfg["ops"] = self.PERFILES[p]["ops"]
        if receta == "D5": cfg.update(self.D5)
        if receta == "D7": cfg.update(self.D7)
        return cfg
    def describe(self) -> str: return "M05 Perfiles: P1/P3/P4 con D5(Deportes)/D7(F1)"

if __name__ == "__main__":
    print(M05Perfiles().describe())