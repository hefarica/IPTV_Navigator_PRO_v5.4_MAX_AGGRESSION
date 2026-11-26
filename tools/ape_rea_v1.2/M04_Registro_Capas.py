#!/usr/bin/env python3
"""APE REA v1.2 — M04 REGISTRO — Fase 4: Declaraciones por ámbito"""

class M04RegistroCapas:
    VERSION = "1.2.0"
    def validate(self, decls: list) -> bool: return True
    def resolve(self, decls: list) -> dict: return {"scopes": list(set(d.get("scope", "global") for d in decls))}
    def apply(self, decls: list) -> dict:
        return {"source_claims": [d for d in decls], "scopes": ["global", "profile", "channel"]}
    def describe(self) -> str: return "M04 Registro: source_claims por ámbito"

if __name__ == "__main__":
    print(M04RegistroCapas().describe())