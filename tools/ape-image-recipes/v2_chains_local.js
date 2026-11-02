#!/usr/bin/env node
/**
 * v2_chains_local.js — ejecuta las cadenas V2 en el ffmpeg LOCAL y mide la resolucion real.
 *
 * Por que existe: la prueba en CI tardaba minutos por vuelta y el error real (gradfun strength fuera
 * de rango) se veia en un segundo en local. Un banco que solo corre en CI no se puede depurar.
 *
 * Mide lo unico que se puede medir sin reproductor: que la cadena EJECUTE y que el frame de salida
 * tenga exactamente la resolucion declarada. No mide calidad de imagen.
 *
 * Uso:
 *   node tools/ape-image-recipes/v2_chains_local.js [--chains ruta] [--ffmpeg ruta]
 * Contrato: 0 = todos los perfiles ejecutan y dan su resolucion · 4 = alguno falla · 3 = uso · 5 = sin ffmpeg
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const args = process.argv.slice(2);
const arg = (nombre, def) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const chainsPath = arg('--chains', 'tools/ape-image-recipes/v2_chains_fixed.txt');

function encontrarFfmpeg() {
  const explicito = arg('--ffmpeg', null);
  if (explicito) return explicito;
  // Windows: el paquete de winget; Linux: PATH
  const candidatos = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe')
  ];
  for (const c of candidatos) if (c && fs.existsSync(c)) return c;
  for (const nombre of ['ffmpeg', 'ffmpeg.exe']) {
    try { execFileSync(nombre, ['-version'], { stdio: 'ignore' }); return nombre; } catch { /* siguiente */ }
  }
  return null;
}

const ffmpeg = encontrarFfmpeg();
if (!ffmpeg) {
  process.stderr.write('ERROR: no hay ffmpeg. Pasa --ffmpeg <ruta> o instalalo.\n');
  process.exit(5);
}

if (!fs.existsSync(chainsPath)) {
  process.stderr.write(`ERROR: no existe ${chainsPath}\n`);
  process.exit(3);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-v2-'));
const filas = [];

for (const linea of fs.readFileSync(chainsPath, 'utf8').split('\n')) {
  if (!/^[A-Z]/.test(linea)) continue;   // P5..P0, REF1.., cualquier identificador en mayuscula
  const [nombre, origen, destino, cadena] = linea.split('|');
  if (!cadena) continue;

  const salida = path.join(tmp, `${nombre}.png`);
  const fila = { perfil: nombre, origen, declarado: destino, real: null, estado: null, error: null };

  try {
    // Se mide en la SALIDA DEL GRAFO, sin encoder de por medio.
    // Antes se escribia a PNG y el encoder era el que fallaba (10-bit 4:2:0 no cabe en PNG;
    // 6144x3456 en rgb48be = 127 MB y el encoder devuelve EINVAL). Un banco que se rompe al
    // guardar no puede decir nada sobre la cadena. showinfo imprime `s:WxH` por frame.
    // showinfo escribe en STDERR, no en stdout: execFileSync devolveria vacio.
    const r = spawnSync(ffmpeg, [
      '-hide_banner', '-nostdin', '-loglevel', 'info',
      '-f', 'lavfi', '-i', `testsrc2=size=${origen}:rate=60:duration=0.2,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709`,
      '-vf', `${cadena},showinfo`,
      '-frames:v', '1', '-f', 'null', '-'
    ], { encoding: 'utf8' });

    if (r.status !== 0) {
      const err = (r.stderr || '').split('\n').filter(Boolean);
      throw { stderr: err.join('\n'), message: `exit ${r.status}` };
    }

    const m = /s:(\d+)x(\d+)/.exec(r.stderr || '');
    if (!m) {
      fila.estado = 'FALLA';
      fila.error = 'showinfo no imprimio dimensiones (¿la cadena no produjo ningun frame?)';
    } else {
      fila.real = `${m[1]}x${m[2]}`;
      // destino '-' significa: solo importa que ejecute, no que acierte la resolucion.
      fila.estado = (destino === '-' || fila.real === destino) ? 'OK' : 'RESOLUCION_DISTINTA';
    }
  } catch (e) {
    const err = (e.stderr || '').toString().split('\n').filter(Boolean);
    fila.estado = 'FALLA';
    fila.error = err.slice(-2).join(' | ') || e.message;
  }
  filas.push(fila);
}

fs.rmSync(tmp, { recursive: true, force: true });

const fallos = filas.filter((f) => f.estado !== 'OK');
const informe = {
  ffmpeg,
  cadenas: chainsPath,
  resumen: { perfiles: filas.length, ok: filas.length - fallos.length, con_problema: fallos.length },
  filas
};
process.stdout.write(JSON.stringify(informe, null, 2) + '\n');

process.stderr.write('\n');
for (const f of filas) {
  if (f.estado === 'OK') {
    process.stderr.write(`  ${f.perfil}  ${f.origen} -> ${f.real}   declarado ${f.declarado}   OK\n`);
  } else {
    process.stderr.write(`  ${f.perfil}  ${f.estado}: ${f.error}\n`);
  }
}
process.stderr.write(`\nperfiles con problema: ${fallos.length}\n`);
process.exit(fallos.length === 0 ? 0 : 4);
