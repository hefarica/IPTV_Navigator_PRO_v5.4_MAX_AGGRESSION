# Referencias — IPTV PREMIUM

## Corpus documental

| Documento | SHA-256 | Uso |
|---|---|---|
| `White_Paper_APE_REA_4K_6K_8K_v1_2.docx` | `5ad04af8cd10d44b3bf1d20a0199cfa067a8a9ad7463e8374b6b1d9bfa30d338` | Arquitectura, capítulos 7–17 y 25 |
| `White_Paper_APE_REA_4K_6K_8K_v1_2.pdf` | `0bc24dd0031edcede9db8cc5c9f3975fd75e6cf1ab9f75f215d93144e4492250` | Render de referencia |
| `Adicional_APE_REA_Catalogo_AXN_Deportes_v1_2.docx` | `3475414a515991ba92165492a3ee4c8daefc94bf3a2bb1baa0f3c0b7733f9265` | D4–D7, AXN, deportes, F1 |
| `Adicional_APE_REA_Catalogo_AXN_Deportes_v1_2.pdf` | `1610a337f67470028e5748bc41a38a969fb4140027b56a7e946ddf35f72d5acb` | Render de referencia |
| `Validacion_entrega_v1_2.json` | `c12eff9675d6c7678dafcde5dd04091fca251066f800a639224ea6f0caf08461` | Estado de validación y límites |

## Evidencia live

```text
artifacts/audit/2026-11-02_APE_LISTA_1793589060441/AUDIT_REPORT.md
artifacts/audit/2026-11-02_APE_LISTA_1793589060441/CHANNEL_159_ANALYSIS.md
artifacts/audit/2026-11-02_APE_LISTA_1793589060441/structural/analysis_summary_pretty.json
artifacts/audit/2026-11-02_APE_LISTA_1793589060441/probe_sample/probe_summary.json
```

## Base de creación

```text
.agents/_archive_20260516_bogus_stubs/skills_bogus_stubs/creador_habilidades/SKILL.md
```

## Advertencias

- El corpus documental valida documentos, no bitstream.
- `full_playlist_received=false`, `provider_requests=0`, `new_bitstream_verification=false`, `new_video_quality_measurements=0` en el JSON de validación.
- La auditoría live usa una muestra HTTP de 50 URLs; no es salud completa.
- No se incluyen credenciales en este documento.


