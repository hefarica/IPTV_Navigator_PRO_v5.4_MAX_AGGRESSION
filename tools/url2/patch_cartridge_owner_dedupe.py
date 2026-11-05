#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dedupe del bloque del propietario en el cartucho: no repetir una declaración
que el template ya trae (p.ej. LCEVC-PHASE). Compara por prefijo de 40 chars."""
import io
import sys

P = '/var/www/html/prisma/api/url2-cartridge.php'
s = io.open(P, encoding='utf-8').read()

old = """if (!$apeHasOwnerDecl) {
    foreach ($apeOwnerDecl as $apeL) { $outLines[] = $apeL; }
}"""
new = """if (!$apeHasOwnerDecl) {
    $apeHave = [];
    foreach ($outLines as $apeL) { $apeHave[substr($apeL, 0, 40)] = true; }
    foreach ($apeOwnerDecl as $apeL) {
        // dedupe por prefijo: no repetir una declaración que ya trae el template
        if (!isset($apeHave[substr($apeL, 0, 40)])) { $outLines[] = $apeL; }
    }
}"""

if new in s:
    print('YA DEDUPEADO')
    sys.exit(0)
if old not in s:
    print('NO MATCH')
    sys.exit(1)
s = s.replace(old, new, 1)
io.open(P, 'w', encoding='utf-8').write(s)
print('DEDUPE OK')
