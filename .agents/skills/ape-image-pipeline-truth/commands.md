# commands.md — comandos verificados

Todos ejecutados el 2026-11-02 en este workspace. `ffmpeg` 8.0.1-full_build en PATH,
VLC en `C:\Program Files\VideoLAN\VLC`.

## 1. Identidad del artefacto

```powershell
(Get-Item $lista).Length
(Get-FileHash $lista -Algorithm SHA256).Hash.ToLower()
```
Esperado para la lista de referencia: `604593696` · `523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`.

## 2. Conteos globales (rápidos, sin cargar el archivo)

```powershell
rg -c -F "#EXTVLCOPT"        $lista   # 1416786
rg -c -F "#KODIPROP"         $lista   # 1089025
rg -c -F "#EXTHTTP"          $lista   # 10573
rg -c -F "video-filter"      $lista   # 10573
rg -c -F "#EXT-X-APE-"       $lista   # 6498710
rg -c -F "zscale"            $lista   # 3116
rg -c -F "gradfun"           $lista   # 3116
rg -c -i -F "bt1886"         $lista   # 12043  <-- case-insensitive SIEMPRE
```

**Trampa:** `rg -c -F "bt1886"` da 0 por case-sensitivity. El valor real es 12.043.

## 3. Delimitar un bloque de canal (NO usar un tramo fijo)

```powershell
# el bloque empieza en #EXTINF y termina antes del siguiente #EXTINF
$all = [System.IO.File]::ReadLines($lista)
```

**Nunca** `rg -A 1500`: eso dio 256/189/108 cuando lo real es 134/103/54.

## 4. Decodificar el LAB de la cabecera

```powershell
node tools/ape-image-recipes/decode_lab_metadata.js $lista --out <dir> --max-lines 400
```
Salida esperada: 20 chunks, 51.890 B, `schema=ape-lab-metadata-v1`, `quality_levels` L1–L7.

## 5. Validar una cadena ffmpeg

```powershell
Set-Content -Path cadena.txt -Value $cadena -NoNewline -Encoding ASCII
ffmpeg -hide_banner -v error -y -i fuente.mp4 -filter_script:v cadena.txt -frames:v 1 -f null -
```
`exit 0` = parsea y ejecuta. Cualquier otro valor: leer el stderr literal y **aislar la etapa**.

Fuente de prueba con tags de color reales (sin esto `zscale=transfer=linear` aborta con 3074):

```powershell
ffmpeg -y -f lavfi -i "testsrc2=s=854x480:r=25" -t 4 -c:v libx264 -preset ultrafast `
  -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv fuente.mp4
```

## 6. Validar una cadena VLC (módulos reales)

```powershell
$args = @("-I","dummy","--vout=dummy","--aout=dummy","--play-and-exit",
          "--file-logging","--logfile=`"$log`"","--log-verbose=2",
          "--video-filter=$cadena", $mp4)
Start-Process -FilePath $vlc -ArgumentList $args -WindowStyle Hidden -PassThru |
  ForEach-Object { if (-not $_.WaitForExit(15000)) { $_.Kill() } }
Get-Content $log | Select-String -Pattern 'using video filter module|Failed to create video filter'
```

Éxito: `using video filter module "<nombre>"` y **cero** `Failed to create video filter`.
Cada módulo debe probarse **aislado**: el arnés headless aborta la cadena tras el primero.

## 7. Auditar nombres de opción `#EXTVLCOPT` contra los binarios de VLC

```powershell
rg -o --no-filename "#EXTVLCOPT:([a-z0-9\-]+)=" -r '$1' $lista | Sort-Object -Unique |
  Set-Content vlcopt_names.txt -Encoding ASCII
node tools/ape-image-recipes/audit_vlcopt.js vlcopt_names.txt `
  --root "C:\Program Files\VideoLAN\VLC" --out vlcopt_audit.json
```
Resultado medido: 138 nombres · 58 presentes · **80 ausentes**.

## 8. Compilar el recetario

```powershell
node tools/ape-image-recipes/compile.js --all
node tools/ape-image-recipes/compile.js --profile P3 --emit ffmpeg
node tools/ape-image-recipes/compile.js --profile P3 --emit vlc
node tools/ape-image-recipes/compile.js --profile P3 --emit manifest
node tools/ape-image-recipes/compile.js --profile P3 --emit m3u --url "http://h/live/U/P/1.m3u8" --vpp-intensity 55
```

## 9. Sintaxis obligatoria tras editar JS

```powershell
node -c tools/ape-image-recipes/compile.js
node -c tools/ape-image-recipes/decode_lab_metadata.js
node -c tools/ape-image-recipes/audit_vlcopt.js
```

## Prohibidos

- `git add -A` / `git commit -a` / `--amend` con trabajo en vuelo.
- Tocar `configs/app.toml` `paper_mode`, `live_exec_policy.rs`, el broadcast path de `bundle_builder.rs`.
- Cualquier escritura en el VPS de producción o en `LAB.xlsm` con Excel abierto.
- Pasar 138 opciones a VLC en un solo arranque: abre diálogo modal y cuelga.
