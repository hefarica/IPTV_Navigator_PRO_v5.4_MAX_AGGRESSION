# NET SHIELD Sentinel — Activación del Diagnoser LLM

El stack LLM está **construido y corriendo en no-op** hasta que pegues tu Anthropic API key. Sin key, el sistema sigue operando normalmente con el diagnoser rule-based (22 firmas conocidas). Con key, empieza a diagnosticar firmas `unknown` automáticamente.

---

## Qué se añadió al VPS

| Componente | Ubicación |
|---|---|
| Venv Python dedicado | `/opt/netshield/venv/` (pip: `anthropic==0.96.0`) |
| Diagnoser LLM | `/opt/netshield/bin/sentinel-llm-diagnose.py` |
| Env template | `/etc/netshield/anthropic.env.template` |
| Log LLM | `/var/log/netshield-llm.log` |
| Integración en cycle | `sentinel-cycle.sh` ahora llama `sentinel-llm-diagnose.py` tras el rule-based |

## Cómo funciona con API key

1. Cada ciclo (1h) el classifier agrupa los eventos en firmas (22 conocidas + `unknown`)
2. Rule-based diagnoser propone fixes para las 22 conocidas
3. **LLM diagnoser** procesa las firmas `unknown` con count ≥ 5:
   - Llama a **Claude Haiku 4.5** (`claude-haiku-4-5`, $1/$5 per 1M tokens)
   - **Prompt caching agresivo**: system prompt + catálogo de 22 firmas conocidas queda cacheado 5 min
   - **Structured output con JSON schema**: devuelve `root_cause`, `fix_bash`, `rationale`, `confidence`, `risk`, `matches_known_signature`
   - **Cap de confidence a 0.80** → ningún diagnóstico LLM alcanza directamente el umbral auto-apply (≥0.9). Siempre requiere tu approval la primera vez.
   - Tras approval y éxito, entra a `kb.jsonl` con `applied_count` → futuras apariciones ganan +0.05 confidence cada vez → eventualmente cruza 0.9 → auto-apply silencioso
4. Executor auto-aplica solo proposals con `confidence≥0.9 + risk=low + cmd en allowlist` (LLM nunca llega directo, siempre vía aprendizaje humano-validado)

## Safeguards del LLM

| Protección | Valor |
|---|---|
| `NETSHIELD_LLM_BUDGET_USD_PER_CYCLE` | `0.10` USD/ciclo (configurable en env) |
| `NETSHIELD_LLM_MAX_UNKNOWNS_PER_CYCLE` | `5` unknowns/ciclo (rate limit) |
| `MIN_COUNT_TO_LLM` | 5 eventos mínimo antes de consultar LLM (no gastar en ruido) |
| Confidence cap | `0.80` (LLM nunca alcanza umbral auto-apply directo) |
| Safety system prompt | Prohíbe `rm -rf`, `systemctl stop`, iptables flush, WG stop, etc. |
| Structured output | JSON schema estricto — no parseo de texto libre |
| Timeout | SDK default + retry automático con backoff |
| Dedup | No re-consulta signatures ya en KB ni ya en proposals pendientes |
| Log completo | Cada llamada al LLM registra tokens + costo USD en `/var/log/netshield-llm.log` |

## Pasos para activar (5 minutos)

### 1. Obtén tu API key

https://console.anthropic.com/settings/keys → `Create Key` → Copia el string `sk-ant-api03-...`

### 2. Pégala en el VPS

```bash
ssh root@178.156.147.234 'cat > /etc/netshield/anthropic.env' <<'EOF'
ANTHROPIC_API_KEY=sk-ant-api03-PEGALA_AQUI
NETSHIELD_LLM_BUDGET_USD_PER_CYCLE=0.10
NETSHIELD_LLM_MAX_UNKNOWNS_PER_CYCLE=5
EOF
ssh root@178.156.147.234 'chmod 600 /etc/netshield/anthropic.env && chown root:root /etc/netshield/anthropic.env'
```

### 3. Valida

```bash
ssh root@178.156.147.234 "/opt/netshield/bin/sentinel-llm-diagnose.py"
```

Output esperado con unknowns activos:
```
[<ts>] sig=llm_unknown_XXXXXXXX tokens=in:X/cr:0/cw:Y/out:Z cost=$0.00XXXX risk=low conf=0.70
[<ts>] LLM diagnoser done: N new proposals, total cost $0.00XXX
```

Si hay 0 unknowns con count≥5 ahora mismo, verás:
```
[<ts>] no unknown signatures reaching threshold — skip
```

Eso también es éxito — significa que todas las firmas actuales ya están cubiertas por el rule-based.

### 4. Dispara un ciclo completo para ver end-to-end

```bash
ssh root@178.156.147.234 "systemctl start netshield-sentinel.service"
curl -s https://iptv-ape.duckdns.org/api/netshield-sentinel.php | python -m json.tool | head -30
```

Si hay proposals nuevos con `"source": "llm"`, aparecerán en el widget del frontend.

## Observabilidad

### Log LLM dedicado

```bash
ssh root@178.156.147.234 "tail -f /var/log/netshield-llm.log"
```

Muestra cada invocación: signature, tokens (incluido cache hit/miss), costo USD, risk+confidence devueltos.

### Verificar prompt caching está efectivo

Tras varios ciclos, busca líneas con `cr:` (cache_read) > 0:
```bash
ssh root@178.156.147.234 "grep -oE 'cr:[0-9]+' /var/log/netshield-llm.log | sort -u"
```

Idealmente el segundo+ cycle lee ~2500 tokens desde cache a 0.1× el precio normal.

### Costo proyectado

| Frecuencia | Tokens/ciclo | Costo/ciclo | Costo/mes |
|---|---|---|---|
| 1 unknown diagnosed con cache hit | ~100 out + 500 in nuevo + 2500 cache_read | ~$0.001 | $0.72/mes |
| 5 unknowns (max) con cache hit | ~500 out + 2500 in + 2500 cache_read | ~$0.004 | $3/mes |
| Worst case sin cache | 5× $0.01 | $0.05 | $36/mes |

Con `BUDGET_USD_PER_CYCLE=0.10` estás capped a **$72/mes** max. En la práctica muy por debajo.

## Rollback del LLM diagnoser

Si quieres desactivar el LLM sin tocar el resto:

```bash
# Opción A: borrar el env
ssh root@178.156.147.234 "rm /etc/netshield/anthropic.env"

# Opción B: comentar la línea en cycle.sh
ssh root@178.156.147.234 "sed -i 's|bin/sentinel-llm-diagnose.py|# &|' /opt/netshield/bin/sentinel-cycle.sh"

# Opción C: desinstalar el venv completo
ssh root@178.156.147.234 "rm -rf /opt/netshield/venv /opt/netshield/bin/sentinel-llm-diagnose.py"
```

Todas son reversibles en segundos. El diagnoser rule-based sigue intacto y el Sentinel sigue corriendo.

## Qué viene después (opcional)

Cuando el LLM acumule ≥10 fixes validados humanamente en `kb.jsonl`, el auto-apply empieza a activarse para patterns recurrentes. Para ver el estado del aprendizaje:

```bash
ssh root@178.156.147.234 "wc -l /opt/netshield/state/kb.jsonl; cat /opt/netshield/state/kb.jsonl | head -5"
```

En el widget del frontend verás el counter **KB aprendido** crecer por cada firma única con fix validado.

---

## Resumen ejecutivo

- ✅ Stack LLM deployado, corriendo en no-op hasta que pegues la API key
- ✅ Haiku 4.5 elegido (mejor $/calidad para esta tarea)
- ✅ Prompt caching + structured output schema implementados
- ✅ Safeguards: budget cap, rate limit, confidence cap, safety system prompt, allowlist
- ✅ Fallback elegante: sin key, sistema sigue igual con rule-based
- ✅ Log dedicado `/var/log/netshield-llm.log` con costo por llamada
- ⏳ **Pendiente tuyo**: pegar API key en `/etc/netshield/anthropic.env` (5 min, paso §2 arriba)

Mientras decidas, el Sentinel está trabajando con sus 22 reglas conocidas y aprendiendo de tus aprobaciones manuales en `kb.jsonl`.
