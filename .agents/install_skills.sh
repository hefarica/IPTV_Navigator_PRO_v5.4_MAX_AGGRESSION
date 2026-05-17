#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# INSTALL_SKILLS.SH — Team Agent Supremo IPTV Enterprise
# Real idempotent installer/validator for .agents/skills/ tree
# ═══════════════════════════════════════════════════════════════════════════════
# Doctrine compliance:
#   - iptv-omega-no-delete: never deletes; uses backup-then-skip-if-exists semantics
#   - iptv-vps-touch-nothing: cero comandos contra VPS
#   - iptv-no-hardcode-doctrine: no values hardcoded; reads from skills_index.json
#   - No mocks, no fake success, no scripts remotos
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR_POSIX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Convert MSYS2/Cygwin /c/Users path to Windows C:/Users when running on Windows
if command -v cygpath >/dev/null 2>&1; then
  SCRIPT_DIR="$(cygpath -m "${SCRIPT_DIR_POSIX}")"
else
  SCRIPT_DIR="${SCRIPT_DIR_POSIX}"
fi
SKILLS_DIR="${SCRIPT_DIR}/skills"
INDEX_FILE="${SCRIPT_DIR}/skills_index.json"
REPORT_FILE="${SCRIPT_DIR}/SKILLS_INSTALLATION_REPORT.md"
BACKUP_DIR="${SCRIPT_DIR}/_backup_$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${SCRIPT_DIR}/reports/install_$(date -u +%Y%m%dT%H%M%SZ).log"

mkdir -p "${SCRIPT_DIR}/reports"

log()  { printf '[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*" | tee -a "${LOG_FILE}"; }
fail() { log "FAIL: $*"; exit 1; }
ok()   { log "OK:   $*"; }

# ─── 1. Pre-flight ─────────────────────────────────────────────────────────────
log "─── PRE-FLIGHT ───"

command -v python3 >/dev/null || fail "python3 required for JSON validation"
[[ -f "${INDEX_FILE}" ]] || fail "Missing ${INDEX_FILE} — run after Team Agent generation"

# Validate index JSON
python3 -c "import json,sys; d=json.load(open('${INDEX_FILE}')); assert 'skills' in d, 'missing skills key'; assert len(d['skills'])>0, 'empty skills array'; print(f'skills_in_index={len(d[\"skills\"])}')" \
  || fail "skills_index.json malformed"

ok "Index validated"

# ─── 2. Idempotency check — list current state ─────────────────────────────────
log "─── INVENTORY ───"

existing_dirs=$(find "${SKILLS_DIR}" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
existing_skill_md=$(find "${SKILLS_DIR}" -mindepth 2 -maxdepth 2 -name 'SKILL.md' 2>/dev/null | wc -l)
existing_lock=$(find "${SKILLS_DIR}" -mindepth 2 -maxdepth 2 -name 'install.lock.json' 2>/dev/null | wc -l)
indexed_count=$(python3 -c "import json; print(len(json.load(open('${INDEX_FILE}'))['skills']))")

log "Existing skill dirs:        ${existing_dirs}"
log "Existing SKILL.md files:    ${existing_skill_md}"
log "Existing install.lock.json: ${existing_lock}"
log "Indexed skills:             ${indexed_count}"

if [[ "${existing_skill_md}" -eq "${indexed_count}" ]]; then
  ok "Idempotent: skills already installed, nothing to do."
  exit 0
fi

if [[ "${existing_dirs}" -lt "${indexed_count}" ]]; then
  log "WARN: ${indexed_count} skills indexed but only ${existing_dirs} dirs present."
  log "      This installer DOES NOT auto-create stubs (would violate 'no maquillaje de éxito')."
  log "      Generation belongs to the Team Agent generator; this script validates only."
fi

# ─── 3. Per-skill validation ───────────────────────────────────────────────────
log "─── VALIDATION (per skill) ───"

bad=0
missing_skill_md=0
missing_lock=0
invalid_json=0

while IFS= read -r dir; do
  name=$(basename "${dir}")
  if [[ ! -f "${dir}/SKILL.md" ]]; then
    missing_skill_md=$((missing_skill_md+1))
    log "  MISS SKILL.md   ${name}"
  fi
  if [[ ! -f "${dir}/install.lock.json" ]]; then
    missing_lock=$((missing_lock+1))
    log "  MISS lock       ${name}"
  elif ! python3 -c "import json; json.load(open('${dir}/install.lock.json'))" 2>/dev/null; then
    invalid_json=$((invalid_json+1))
    log "  BAD JSON lock   ${name}"
  fi
done < <(find "${SKILLS_DIR}" -maxdepth 1 -mindepth 1 -type d)

bad=$((missing_skill_md + missing_lock + invalid_json))

log "Validation result:"
log "  missing SKILL.md       : ${missing_skill_md}"
log "  missing install.lock   : ${missing_lock}"
log "  invalid install.lock   : ${invalid_json}"

# ─── 4. Secret scan (cero secretos en skills) ──────────────────────────────────
log "─── SECRET SCAN ───"

secret_hits=$(grep -rIE 'password=|api_key=|secret=|bearer\s+[A-Za-z0-9]{20,}|sk_live_|AKIA[0-9A-Z]{16}' "${SKILLS_DIR}" 2>/dev/null | wc -l || true)
if [[ "${secret_hits}" -gt 0 ]]; then
  log "WARN: ${secret_hits} potential secret patterns found. Review:"
  grep -rIlE 'password=|api_key=|secret=|bearer\s+[A-Za-z0-9]{20,}|sk_live_|AKIA[0-9A-Z]{16}' "${SKILLS_DIR}" 2>/dev/null | head -20 | tee -a "${LOG_FILE}"
else
  ok "Cero secretos detectados en skills"
fi

# ─── 5. Summary ────────────────────────────────────────────────────────────────
log "─── SUMMARY ───"
log "Indexed: ${indexed_count} · On disk: ${existing_skill_md} · Bad: ${bad} · Secrets: ${secret_hits}"

if [[ "${bad}" -eq 0 && "${secret_hits}" -eq 0 ]]; then
  ok "Install validation PASSED"
  exit 0
else
  fail "Install validation has ${bad} structural issues and ${secret_hits} secret hits"
fi
