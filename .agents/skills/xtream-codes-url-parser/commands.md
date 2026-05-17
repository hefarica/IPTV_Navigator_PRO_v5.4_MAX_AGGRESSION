# Commands — xtream-codes-url-parser

## Comandos permitidos (read-only + validate)
```bash
# Sintaxis
node -c <file.js>
php -l <file.php>
python -m py_compile <file.py>
nginx -t                              # syntax + load test
luac -p <file.lua>                    # if luac available
python -m json.tool <file.json>       # JSON validate
jq empty <file.json>                  # JSON validate (jq alternative)

# Diff vs HEAD
git diff <file>
git diff --stat
git log -5 --oneline -- <file>

# Smoke test M3U8
head -30 <list.m3u8>
grep -E "^#EXT-X-" <list.m3u8> | sort | uniq -c

# Smoke test endpoint
curl -sI <url>
curl -s -o /dev/null -w "HTTP %{http_code} time=%{time_total}s\n" <url>
```

## Comandos prohibidos (sin autorización explícita)
```bash
# DESTRUCTIVE
rm -rf /
git push --force origin master         # except with explicit user "force push" approval
git reset --hard HEAD~N                # destructive on shared history
git clean -fdx                         # wipes untracked
git checkout -- .                      # discards ALL local changes (use selective)

# REMOTE PROD
ssh root@<vps> 'nginx -s stop'         # use reload or restart consciously
ssh root@<vps> 'systemctl stop X'      # without backup + observation window
ssh root@<vps> 'rm <prod-file>'        # NEVER without backup_X.bak

# INSTALL UNCHECKED
curl <url> | bash                      # no verification
npm install <pkg>                      # without npm audit + lock
pip install <pkg>                      # without pip-audit
docker pull <img>:latest               # without digest pin
```

## Comandos específicos a esta skill
Ver `tests.md` para casos concretos.
Ver `scripts/` para herramientas auxiliares.
