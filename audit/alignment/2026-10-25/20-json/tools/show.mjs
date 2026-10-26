#!/usr/bin/env node
// Generic read-only viewer: node show.mjs <jsonFile> [jsonPath-dot]
import fs from 'node:fs';
const file = process.argv[2];
const path = process.argv[3];
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
let cur = doc;
if (path) for (const seg of path.split('.')) { if (cur == null) break; cur = cur[seg]; }
console.log(typeof cur === 'string' ? cur : JSON.stringify(cur, null, 2));
