#!/usr/bin/env node
/**
 * validate_skills.js — verificador de las 3 skills de este encargo.
 *
 * QUÉ HACE (y qué NO):
 *   - Valida el frontmatter YAML de cada SKILL.md con un parser ESTRICTO del
 *     subconjunto que usa la convención del repo (clave: valor escalar plano).
 *     No es un parser YAML completo: no hay librería YAML disponible y NO se
 *     instala nada (npm/pip prohibidos por el encargo). Un documento que pase
 *     aquí es YAML válido para este subconjunto; no se afirma más que eso.
 *   - Comprueba: delimitadores `---`, claves duplicadas, tabs, `name` = carpeta,
 *     `description` presente y de longitud razonable, sin comillas ni ": " que
 *     romperían el escalar plano, `specialist`/`kind` si existen.
 *   - Comprueba: fences ``` balanceados, numeración de secciones contigua,
 *     y que exista `references.md`.
 *   - NO valida semántica ni veracidad del contenido.
 *
 * USO: node .agents/skills/iptv-supreme-repos-atlas/scripts/validate_skills.js
 * SALIDA: PASS/FAIL por item + resumen. exit 1 si algo falla.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // → .agents/skills
const SKILLS = ['iptv-supreme-repos-atlas', 'iptv-real-resolution-verifier', 'iptv-profile-fallback-doctrine'];

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' · ' + detail : '')); }
}

/** Parser estricto del subconjunto `clave: valor` (escalar plano, sin anidamiento). */
function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return { error: 'la primera línea no es ---' };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { error: 'no hay cierre ---' };
  const raw = lines.slice(1, end);
  const data = {};
  const problems = [];
  raw.forEach((ln, i) => {
    if (ln === '') return;
    if (/\t/.test(ln)) problems.push('tab en la línea ' + (i + 2));
    const m = ln.match(/^([A-Za-z_][A-Za-z0-9_-]*):[ ](.+)$/);
    if (!m) { problems.push('línea no parseable ' + (i + 2) + ': ' + JSON.stringify(ln)); return; }
    const k = m[1], v = m[2];
    if (Object.prototype.hasOwnProperty.call(data, k)) problems.push('clave duplicada: ' + k);
    data[k] = v;
  });
  return { data, problems, bodyStart: end + 1 };
}

for (const name of SKILLS) {
  const dir = path.join(ROOT, name);
  const skillPath = path.join(dir, 'SKILL.md');
  const refsPath = path.join(dir, 'references.md');

  ok(name + ' :: SKILL.md existe', fs.existsSync(skillPath), skillPath);
  if (!fs.existsSync(skillPath)) continue;

  const text = fs.readFileSync(skillPath, 'utf8');
  const fm = parseFrontmatter(text);

  ok(name + ' :: frontmatter delimitado', !fm.error, fm.error || '--- … ---');
  if (fm.error) continue;

  ok(name + ' :: frontmatter sin problemas de sintaxis', fm.problems.length === 0,
     fm.problems.length ? fm.problems.join(' | ') : 'sin tabs, sin claves duplicadas');

  const d = fm.data;
  ok(name + ' :: name presente', typeof d.name === 'string' && d.name.length > 0);
  ok(name + ' :: name == carpeta', d.name === name, d.name + ' vs ' + name);
  ok(name + ' :: name con forma kebab-case', /^[a-z0-9][a-z0-9-]{1,63}$/.test(d.name || ''), d.name);

  const desc = d.description || '';
  ok(name + ' :: description presente', desc.length > 0);
  ok(name + ' :: description longitud 40..1200', desc.length >= 40 && desc.length <= 1200, desc.length + ' chars');
  ok(name + ' :: description escalar plano seguro',
     !/["']/.test(desc) && !/: /.test(desc) && desc === desc.trim(),
     'sin comillas, sin ": ", sin espacios en los extremos');

  if (d.specialist !== undefined) {
    ok(name + ' :: specialist válido', /^S([1-9]|10)$/.test(d.specialist), d.specialist);
  }
  if (d.kind !== undefined) {
    ok(name + ' :: kind válido', ['anchor', 'satellite'].includes(d.kind), d.kind);
  }

  const body = text.split('\n').slice(fm.bodyStart).join('\n');

  const fences = (body.match(/^```/gm) || []).length;
  ok(name + ' :: fences ``` balanceados', fences % 2 === 0, fences + ' fences');

  const secs = [...body.matchAll(/^## (\d+)\./gm)].map(m => Number(m[1]));
  ok(name + ' :: tiene secciones numeradas', secs.length >= 5, secs.length + ' secciones');
  const contiguous = secs.every((n, i) => n === i + 1);
  ok(name + ' :: numeración contigua desde 1', contiguous, secs.join(','));

  ok(name + ' :: references.md existe', fs.existsSync(refsPath), refsPath);
  if (fs.existsSync(refsPath)) {
    const r = fs.readFileSync(refsPath, 'utf8');
    ok(name + ' :: references declara lo NO verificado', /NO VERIFICADO|NO COMPUTADO|NO EJECUTADO/.test(r));
    ok(name + ' :: references declara qué no se copió', /no se copi|copiar|NO se copi|Cero código/i.test(r));
  }

  const bytes = Buffer.byteLength(text, 'utf8');
  ok(name + ' :: tamaño razonable', bytes > 2000 && bytes < 60000, bytes + ' B · ' + text.split('\n').length + ' líneas');
}

console.log('\nRESUMEN  PASS=' + pass + '  FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
