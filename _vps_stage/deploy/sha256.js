#!/usr/bin/env node
// sha256.js — hash SHA-256 de un fichero. Portable: funciona igual en Linux y
// en un orquestador Windows sin sha256sum. Sin dependencias.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');

const file = process.argv[2];
if (!file) {
    process.stderr.write('uso: node sha256.js <fichero>\n');
    process.exit(2);
}
try {
    const buf = fs.readFileSync(file);
    process.stdout.write(crypto.createHash('sha256').update(buf).digest('hex'));
} catch (e) {
    process.stderr.write(`sha256: ${file}: ${e.message}\n`);
    process.exit(3);
}
