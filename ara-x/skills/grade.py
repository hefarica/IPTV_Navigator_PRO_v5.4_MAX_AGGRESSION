#!/usr/bin/env python3
import json, re, sys, pathlib, hashlib
SELF = pathlib.Path("/etc/ara/skills/self")
EXAM = json.load(open("/etc/ara/skills/exam/questions.json"))
ANS = SELF / "answers.json"
def norm(s): return re.sub(r"\s+", " ", s.lower())
skills = list(SELF.glob("S-*.md"))
if not skills:
    print("FALLA: no hay skills propias"); sys.exit(1)
domains = {}
for p in skills:
    t = p.read_text()
    fm = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    if not fm:
        print(f"FALLA {p.name}: sin frontmatter"); sys.exit(1)
    meta = dict(re.findall(r"^(\w+):\s*(.+)$", fm.group(1), re.M))
    for k in ("id", "domain", "source"):
        if k not in meta: print(f"FALLA {p.name}: falta {k}"); sys.exit(1)
    if not meta["source"].startswith("http"):
        print(f"FALLA {p.name}: fuente no es URL"); sys.exit(1)
    if "```" not in t:
        print(f"FALLA {p.name}: sin bloque de codigo"); sys.exit(1)
    if "## Antipatrón" not in t and "## Antipatron" not in t:
        print(f"FALLA {p.name}: sin seccion antipatron"); sys.exit(1)
    domains[meta["domain"]] = domains.get(meta["domain"], 0) + 1
req = set(q["d"] for q in EXAM["questions"])
faltan = [d for d in req if domains.get(d, 0) < 3]
if faltan:
    print("FALLA cobertura: " + ", ".join(f"{d}={domains.get(d,0)}/3" for d in faltan)); sys.exit(1)
if not ANS.exists(): print("FALLA: falta self/answers.json"); sys.exit(1)
answers = {k: norm(v) for k, v in json.load(open(ANS)).items()}
total = len(EXAM["questions"]); score = 0
for q in EXAM["questions"]:
    a = answers.get(q["id"], "")
    hit = sum(1 for k in q["k"] if k in a)
    ok = hit / len(q["k"]) >= 0.7
    score += 1 if ok else 0
    if not ok: print(f"  {q['id']} [{q['d']}] hit={hit}/{len(q['k'])}")
pct = score / total * 100
print(f"\nPUNTAJE {pct:.0f}/100 (min {EXAM['pass_score']}) skills={len(skills)} dominios={len(domains)}")
if pct < EXAM["pass_score"]: print("NO APROBADO"); sys.exit(1)
h = hashlib.sha256()
for p in sorted(SELF.glob("S-*.md")): h.update(p.read_bytes())
(SELF / "APPROVED").write_text(h.hexdigest() + "\n")
print("APROBADO — APPROVED emitido")
