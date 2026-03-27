# Manual de Usuario
## APE Resilience Toolkit v6.3

---

## ¿Qué hace este sistema?

Convierte tu VPS IPTV en un **orquestador inteligente** que:
1. **Nunca deja de reproducir** — detecta problemas antes de que los veas
2. **Fuerza al ISP a darte bandwidth** — marca paquetes con máxima prioridad
3. **Mejora la imagen automáticamente** — activa los procesadores de IA de tu TV
4. **Aprende de cada canal** — los canales problemáticos reciben más protección

---

## ¿Cómo funciona para mí?

### Cuando haces clic en un canal:
```
1. Tu clic llega al VPS (resolve_quality.php)
2. En 5ms, 5 motores analizan:
   - ¿La red está estable? → sube/baja agresión
   - ¿Cuánto ancho de banda necesita? → floor mínimo
   - ¿Qué TV y player tienes? → activa AI de tu TV
3. Responde con headers optimizados
4. Tu Fire Stick decodifica → Samsung aplica 768 neural nets
5. Ves imagen 4K HDR a 5000 nits
```

Total: **5 milisegundos** (imperceptible)

---

## Mi TV y Player

### Combo detectado
Tu sistema detecta automáticamente:
- **Player:** Fire Stick 4K Max / ONN 4K
- **TV:** Samsung (NQ8 AI Gen3)
- **Modo:** COMBO (Player decodifica, TV mejora con IA)

### Si compras otro TV/Player
No tienes que hacer nada. El sistema detecta automáticamente 20 dispositivos:
- 9 marcas de TV (Samsung, LG, Sony, Hisense, TCL, Philips, Xiaomi, Vizio, Panasonic)
- 6 players (Fire TV, Apple TV, NVIDIA Shield, ONN 4K, Chromecast, Roku)

---

## ¿Qué significan los niveles?

| Nivel | Color | Significado | Lo que el sistema hace |
|:---|:---:|:---|:---|
| NORMAL | 🟢 | Red estable | 3 conexiones TCP, prioridad media |
| ESCALATING | 🟡 | Red bajando | 4 conexiones, exige 25% más bandwidth |
| BURST | 🟠 | Red mala | 6 conexiones, exige 50% más, DSCP alto |
| NUCLEAR | 🔴 | Red en crisis | 8 conexiones, DOBLE bandwidth, máxima prioridad |

**El sistema NUNCA baja la calidad de imagen.** Prefiere pelear por más bandwidth que degradar la resolución.

---

## ¿Cómo verifico que funciona?

### Método 1: Ver el log en vivo
```bash
ssh root@TU_VPS "tail -f /var/log/iptv-ape/shim_operations.log"
```
Debes ver entradas con `"ai":"samsung"` y `"ms"` menor a 10.

### Método 2: Ver qué dispositivos detectó
```bash
ssh root@TU_VPS "cat /tmp/ape_device_memory.json"
```

### Método 3: Ver canales problemáticos
```bash
ssh root@TU_VPS "cat /tmp/neuro_telemetry_state.json | python3 -m json.tool"
```

---

## Solución de Problemas

| Problema | Solución |
|:---|:---|
| Canal se congela | El Freeze Detector ya lo está escalando a NUCLEAR. Espera 30 seg. |
| Imagen borrosa | Verifica que la URL pase por `resolve_quality.php`, no directo al proveedor |
| Zapping lento | Normal en primera carga. Segundo intento será instantáneo (cache) |
| `ai: generic` en logs | Tu player no es reconocido. Se puede agregar su User-Agent |

---

## Términos Clave

| Término | Significado |
|:---|:---|
| **Bandwidth Floor** | Mínimo de Mbps que el sistema exige para cada canal |
| **DSCP** | Marca en los paquetes que le dice al router "prioriza esto" |
| **Combo Mode** | Player + TV trabajando juntos (player decodifica, TV mejora) |
| **Freeze Memory** | El sistema recuerda canales problemáticos y los protege más |
| **Zero Proxy** | El VPS nunca toca los bytes de video, solo envía instrucciones |
