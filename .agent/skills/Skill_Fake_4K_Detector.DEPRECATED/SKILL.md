---
name: Skill_Fake_4K_Detector
description: "DEPRECATED 2026-06-20 — reemplazado por Skill_4K_Enhancement_Enforcer. El fake-4K ahora está PERMITIDO y OBLIGATORIO (DIRECTIVA FAKE 4K SUPREMO). Este detector ya no se usa."
---

# Skill: Skill_Fake_4K_Detector — DEPRECATED (2026-06-20)

> **⛔ DEPRECATED.** Esta skill detectaba "fake 4K" (resolución declarada > resolución real) y ordenaba
> degradar el perfil. Por orden explícita del propietario (2026-06-20, "DIRECTIVA FAKE 4K SUPREMO" en
> `CLAUDE.md`), el fake-4K está **PERMITIDO Y OBLIGATORIO**. La detección/degradación queda **anulada**.
>
> **Reemplazada por:** `Skill_4K_Enhancement_Enforcer` (fuerza 4K/HDR/HEVC/LCEVC/HDCP en 100% de canales).
>
> El contenido original se conserva en los backups (`.backups/fake4k-unlocked-*`) y en
> `.agents/_archive_20260516_bogus_stubs/skills_bogus_stubs/Skill_Fake_4K_Detector/`.

## Status
- `True4K_Index` / `Downscale_Directive`: **NO se emiten** (lógica anulada).
- Cualquier invocación debe redirigir a `Skill_4K_Enhancement_Enforcer`.
