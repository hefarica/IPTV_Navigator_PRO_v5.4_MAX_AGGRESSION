# Pruebas de persistencia (reproducibles)

Requisitos: Chrome instalado (`CHROME_PATH`) y un servidor local para el origen.

```bash
# 1) servir las páginas (copia los módulos al lado)
cp IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-ui-persistence.js tools/url2/persist_test_pages/
cp IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-import-helper.js tools/url2/persist_test_pages/
node tools/url2/persist_test_pages/server.js tools/url2/persist_test_pages 8123

# 2) persistencia de CONTROLES (dos procesos Chrome, mismo perfil)
#    phase1 guarda; phase2 reabre y verifica PERSIST_OK
node tools/url2/cdp_live_persist_check.js https://iptv-ape.duckdns.org/index-v4.html   # roundtrip real en producción

# 3) persistencia del LAB COMPLETO (dos procesos Chrome, mismo perfil)
node tools/url2/cdp_lab_persist_test.js phase3   # guarda en IndexedDB
node tools/url2/cdp_lab_persist_test.js phase4   # reabre y compara hash/secciones
```
