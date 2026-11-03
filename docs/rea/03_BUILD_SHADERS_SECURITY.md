# 03 · Build FFmpeg + shaders + API JSON — seguridad y coste 0

**Tarea:** `t21` (Ciclo REA) · **Fecha:** 2026-10-27 · **Autor:** `s7-sre-secops`
**Alcance:** receta reproducible, seguridad y coste 0. **Cero instalación, cero SSH, cero escrituras fuera de `docs/rea/`, cero credenciales.**
**Host de medición:** Windows 10.0.26200 · i7-13620H · 15,7 GB RAM · GPU **Intel UHD (iGPU, sin NVIDIA)** · ffmpeg **8.0.1-full_build** (Gyan) · Vulkan **1.3.284**.

> **Regla de lectura:** lo marcado `[MEDIDO]` se ejecutó en este host y tiene exit code. Lo marcado `[DOC]` viene de la fuente citada. Lo marcado `NOT_RUN` **no se ejecutó** y se declara con causa. Nada se presenta como verificado sin una de las tres marcas.

---

## 0. Qué se pudo verificar y qué no

| Bloque | Estado | Causa / evidencia |
|---|---|---|
| Flags reales de un build con libplacebo | **`[MEDIDO]`** | `ffmpeg -version` → línea `configuration:` con **100 flags** |
| libplacebo funcional en GPU | **`[MEDIDO]`** | filtro `libplacebo` corre, `exit 0` (§8) |
| Versión exacta de libplacebo | **`[MEDIDO]`** | log: `Initialized libplacebo v7.357.0 (API v357)` |
| Compilar FFmpeg aquí | **NOT_RUN** | no hay `cmake`/`gcc`/`make`/`msys2` en PATH (solo el binario prebuilt) |
| mpv / `--glsl-shaders` | **NOT_RUN** | `mpv` no está instalado en este host |
| Real-ESRGAN-ncnn-vulkan | **NOT_RUN** | no instalado; se mide la **capacidad Vulkan del host** (§3) |
| Transcode en el VPS 2 GB | **NOT_RUN** | prohibido tocar el VPS (`iptv-vps-touch-nothing`) |

---

## 1. Build de FFmpeg

### 1.1 Los flags, medidos en un build real (no copiados de una wiki)

`ffmpeg -version` de este host declara 100 flags. Los relevantes para imagen/HDR/códec, con su efecto:

| Flag | ¿Presente? | Para qué sirve |
|---|---|---|
| `--enable-libplacebo` | **sí** | filtro `libplacebo` (escalado, tone-mapping, shaders) |
| `--enable-vulkan` | **sí** | backend GPU de libplacebo + `-init_hw_device vulkan` |
| `--enable-libshaderc` | **sí** | compilador GLSL→SPIR-V que libplacebo necesita |
| `--enable-libx265` | **sí** | HEVC software (GPL) |
| `--enable-nvenc` / `--enable-nvdec` / `--enable-ffnvcodec` | **sí** | HEVC/AV1 por NVIDIA — **compilado ≠ ejecutable** (§8, TEST 4) |
| `--enable-vaapi` / `--enable-libvpl` / `--enable-amf` | **sí** | HEVC por Intel (VAAPI/oneVPL) y AMD (AMF) |
| `--enable-gpl` + `--enable-version3` | **sí** | **GPLv3** (no GPLv2) |
| `--enable-nonfree` | **no** | build redistribuible |

`ffmpeg 8.0.1` · `gcc 15.2.0 (MSYS2)` · binario `sha256 74db6c184a03dba2bdfe23e1a1f41cf5a8385bc1de6a7a1b26db1dc541abef93` · 211 091 968 B `[MEDIDO]`.

### 1.2 Receta mínima en sandbox (Ubuntu, contenedor desechable) — `NOT_RUN` aquí

```bash
# NO se ejecutó en este host (sin toolchain). Comandos reproducibles para el sandbox:
sudo apt-get build-dep -y ffmpeg && sudo apt-get install -y meson ninja-build \
  libvulkan-dev vulkan-tools glslang-tools libshaderc-dev libx265-dev libnuma-dev
git clone --depth 1 --branch n8.0.1 https://git.ffmpeg.org/ffmpeg.git && cd ffmpeg
./configure --enable-gpl --enable-version3 --enable-libplacebo --enable-vulkan \
  --enable-libshaderc --enable-libx265 --disable-doc --disable-debug \
  --prefix=/opt/ffmpeg-8.0.1 && make -j"$(nproc)" && make install
/opt/ffmpeg-8.0.1/bin/ffmpeg -version | head -3   # gate: debe listar libplacebo y vulkan
```
Añadir `--enable-nvenc --enable-cuda-llvm --enable-ffnvcodec` **solo** si la caja tiene NVIDIA con driver; añadir `--enable-vaapi`/`--enable-libvpl` para Intel/AMD. **Nunca** `--enable-nonfree` en un artefacto que se distribuya.

### 1.3 Paquete de distro vs compilar

| Criterio | Paquete distro | Compilar |
|---|---|---|
| libplacebo/vulkan | **frecuentemente ausente** o sin shaderc | control total |
| Versión de libplacebo | la que imponga la distro | **la que exija `configure`** |
| Licencia | la del paquete (suele ser GPLv3 con `version3`) | elegible (LGPL sin `--enable-gpl`) |
| Riesgo | dependencia de terceros | cadena de suministro propia |

Recomendación: **paquete de distro para consumir; build propio solo para el nodo GPU**, con tag y flags fijados y checksum del binario publicado.

### 1.4 Dependencias que no son obvias
- **libplacebo** exige `vulkan` **y** `shaderc` (preferido) o `glslang` (alternativa); sin ellos se construye pero "la utilidad queda severamente mermada" `[DOC]` — <https://github.com/haasn/libplacebo> (README, tag v1.7.0-rc2) · build con **meson + ninja**.
- **Acoplamiento de versiones `[MEDIDO]`**: el par que funciona aquí es **FFmpeg 8.0.1 ↔ libplacebo v7.357.0 (API v357)**. El mínimo exacto lo impone el `configure` de cada FFmpeg (`NOT_RUN`: sin toolchain) — **no se debe asumir** que una libplacebo vieja compila con un FFmpeg nuevo.
- **x265**: GPLv2 **o** licencia comercial; el `GPLv2` obliga a liberar el binario bajo GPL si se distribuye, y **no cubre patentes** (MPEG LA / HEVC Licensing Program) `[DOC]` — <https://x265.readthedocs.io/en/stable/introduction.html>.
- **Enlaces oficiales**: CompilationGuide <https://trac.ffmpeg.org/wiki/CompilationGuide/Ubuntu> · build genérico <https://trac.ffmpeg.org/wiki/CompilationGuide> · HDR/tone-mapping <https://trac.ffmpeg.org/wiki/colorspace> · repo FFmpeg <https://git.ffmpeg.org/ffmpeg.git> · libplacebo <https://github.com/haasn/libplacebo>.

---

## 2. Shaders (mpv / libplacebo)

### 2.1 Cómo se cargan — lo que el binario de este host acepta `[MEDIDO]`

`ffmpeg -h filter=libplacebo` (opciones reales, no supuestas):

| Opción | Texto literal del binario |
|---|---|
| `custom_shader_path <string>` | *Path to custom user shader (mpv .hook format)* |
| `custom_shader_bin <binary>` | *Custom user shader as binary (mpv .hook format)* |
| `shader_cache <string>` | *Set shader cache path* |
| `upscaler` / `downscaler` | *default `spline36` / `mitchell`* |

⇒ En la capa FFmpeg el shader se inyecta con **`custom_shader_path`**, y el formato esperado es el **`.hook` de mpv**.
En **mpv** la vía documentada es `--glsl-shaders=<file-list>` (manual de mpv, sección *Shaders*): `NOT_RUN` — `mpv` no está instalado aquí, no se verificó la opción ni la carga real.

```bash
# forma de uso en FFmpeg (NO ejecutado: requiere un shader .hook válido y GPU):
ffmpeg -init_hw_device vulkan=vk -i in.mkv \
  -vf "hwupload,libplacebo=w=3840:h=2160:custom_shader_path=/ruta/shader.hook" -f null -
```

### 2.2 Catálogo, origen y licencia

| Shader | Origen (proyecto) | Licencia | Plano objetivo | Verificación |
|---|---|---|---|---|
| **Anime4K** | <https://github.com/bloc97/Anime4K> | **MIT** (bloc97, 2019) `[DOC]` LICENSE | luma / line-art (upscale+denoise) | licencia **verificada**; ejecución NOT_RUN |
| **FSRCNNX** | <https://github.com/igv/FSRCNN-TensorFlow> | **NO VERIFICADO** | **luma** (SR por CNN); el croma se delega al escalador de croma | procedencia `[DOC]` (enlazado desde Anime4K); sin ejecutar |
| **SSimSuperRes** | proyecto `igv` (misma familia) | **NO VERIFICADO** | **luma** (SR perceptual) | sin ejecutar |
| **KrigBilateral** | proyecto `igv` | **NO VERIFICADO** | **croma** (reconstrucción croma←luma) | sin ejecutar |
| **Real-ESRGAN** (modelo) | <https://github.com/xinntao/Real-ESRGAN> | **BSD-3-Clause** `[DOC]` LICENSE | luma (SR por red, no tiempo real) | licencia **verificada**; ejecución NOT_RUN |

**Criterio de uso:** los shaders de **luma** (FSRCNNX/SSimSuperRes/Anime4K) se combinan con un **escalador de croma** (`KrigBilateral` o el `cscale` del renderer) — aplicar un shader de luma al croma es un error de diseño, no una mejora. Las tres licencias sin verificar **bloquean** cualquier uso distribuido hasta confirmarlas leyendo el `LICENSE` del repo correspondiente.

## 3. Real-ESRGAN-ncnn-vulkan

- **Licencia del proyecto:** BSD-3-Clause (Xintao Wang, 2021) `[DOC]` — <https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE>. Los **pesos** de cada modelo tienen su propia nota de licencia: **no verificada aquí**.
- **Requisito duro:** Vulkan. Capacidad del host medida: **apiVersion 1.3.284**, `deviceType = INTEGRATED_GPU`, driver 101.5592 `[MEDIDO]` (`vulkaninfo --summary`).
- **Build** (CMake + Vulkan SDK + ncnn): `NOT_RUN` — no hay cmake/compilador en este host. No se instala nada.
- **Modelos**: se sirven como pares `.param`+`.bin`; cualquier descarga debe **fijarse por versión y verificarse por checksum** antes de usarse (§5).
- **Coste real:** es un **upscaler offline por GPU**, no un filtro de tiempo real; en la cadena de reproducción no aporta (el player no puede esperar a una red neuronal por frame). Su sitio es el *pre-proceso por lotes*, no el edge.

## 4. API de control JSON (diseño; nada instalado)

**Principio:** el API **no** toca el plano de reproducción. Es un panel de control de trabajos (encolar/consultar/cancelar), con binding **loopback** y token. Coste 0 = mismo host; si se separa en nodo GPU, el API sigue aquí y solo viaja el trabajo.

```ini
# Unidad PROPUESTA (no instalada, no habilitada). Endurecida:
[Unit]
Description=REA control API (loopback only)
After=network.target
[Service]
Type=simple
ExecStart=/opt/rea/bin/rea-api --bind 127.0.0.1 --port 8787 --token-file /etc/rea/token
Restart=on-failure
RestartSec=3
User=rea
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/rea
[Install]
WantedBy=multi-user.target
```

| Control | Decisión |
|---|---|
| Binding | **`127.0.0.1` obligatorio**; jamás `0.0.0.0`. Si hace falta acceso remoto: túnel, no exposición |
| Auth | `Authorization: Bearer <token>` comparado en **tiempo constante** (`hash_equals`); token en archivo `0600`, nunca en query string (se loguea) |
| Rate-limit | 10 r/s, burst 10, `429`; el trabajo pesado va a cola, no a concurrencia libre |
| Health | `GET /healthz` → `{status, version, queue_depth, gpu_ok}`; **200 solo si `gpu_ok`** |
| Logs | JSON line a `journald` + `access_log off` para no filtrar el token; redacción de rutas de entrada |
| Errores | `400/401/429/503` con cuerpo JSON; nunca volcar rutas internas ni versiones en el mensaje |

**Riesgos de seguridad (los 3 que importan):** (1) token en URL o en logs → fuga; (2) binding accidental a `0.0.0.0` en un VPS público → ejecución remota de trabajos; (3) rutas de entrada sin allowlist → lectura arbitraria de archivos del host.

## 5. Cadena de suministro

1. **Pin por tag**, nunca por rama: `ffmpeg n8.0.1`, `libplacebo v7.x (API 357)`, `x265 <tag>`, modelos Real-ESRGAN por release — y **checksum del artefacto** antes de usarlo: método aplicado aquí al propio binario, `sha256(ffmpeg.exe) = 74db6c18…ef93` `[MEDIDO]`.
2. **Licencias**: FFmpeg GPLv3 en este build (`--enable-gpl --enable-version3`, sin `--enable-nonfree`); libplacebo **LGPLv2.1+** `[DOC]`; x265 **GPLv2 o comercial** `[DOC]`; Anime4K **MIT** `[DOC]`; Real-ESRGAN **BSD-3** `[DOC]`. **FSRCNNX/SSimSuperRes/KrigBilateral: NO VERIFICADO** ⇒ bloquean distribución hasta confirmarse. La licencia del software **no cubre patentes** HEVC `[DOC]` (x265 docs).
3. **Sin GPU se puede probar**: `ffmpeg -version`/`-buildconf` (flags), `-filters`/`-encoders`/`-hwaccels` (capacidades), `node -c`/`-f null` de la cadena, `vulkaninfo --summary` (¿hay Vulkan?), y todo el **encode CPU**. No se puede probar: shaders, nvenc, libplacebo real.

---

## 6. Matriz hardware (decisión, no opinión)

| Caja | Veredicto | Base |
|---|---|---|
| **VPS 2 GB sin GPU** | **NO-GO para transcode** | sin GPU ⇒ todo a CPU; `[MEDIDO]` en esta caja (i7-13620H) 1080p x265 **ultrafast 102,7 fps / veryfast 55,1 fps**; un VPS de 2 vCPU está muy por debajo ⇒ 1080p en tiempo real es dudoso y 4K queda fuera. La cifra del VPS es **NOT_RUN**: no se mide sin tocarlo |
| **Nodo GPU mínimo** | **GO** para 1 stream UHD de filtros/shader | `[MEDIDO]` libplacebo 1080p→2160p `ewa_lanczos` en **iGPU Intel UHD = 21,9 fps** ⇒ hace falta una GPU dedicada para 4K en tiempo real |
| **Esta laptop (iGPU)** | GO parcial | sirve para **validar la cadena** (shaders, flags, API) a coste 0; no para servir 4K |

**Criterio operativo:** el transcode/realce **no** se mete en el VPS de producción (2 GB, sin GPU, y la doctrina prohíbe tocarlo). Si se quiere imagen realzada, va en un nodo GPU aparte que consume/produce ficheros; el VPS sigue siendo rebase-only.

---

## 7. Verificación práctica ejecutada (coste 0, exit codes reales)

| # | Comando (resumido) | exit | Resultado |
|---|---|---|---|
| TEST 1 | `ffmpeg -vf libplacebo=w=640:h=480 -f null -` | **0** | libplacebo funciona en la iGPU |
| TEST 2 | `ffmpeg -init_hw_device vulkan=vk … hwupload,libplacebo` | **0** | device Vulkan explícito OK |
| TEST 3 | `ffmpeg -c:v libx265 -preset ultrafast` (320x240, 2 s) | **0** | encode CPU OK (177 ms) |
| TEST 4 | `ffmpeg -c:v hevc_nvenc` | **-1** | `Cannot load nvcuda.dll` ⇒ **flag compilado ≠ device** |
| TEST 5 | `ffmpeg -c:v hevc_qsv` | **0** | Quick Sync OK |
| TEST 6 | `libx265` 1080p 50f: `ultrafast` / `veryfast` | **0 / 0** | **102,7 / 55,1 fps** |
| TEST 7 | `libplacebo=w=3840:h=2160:upscaler=ewa_lanczos` 1080p50f | **0** | **21,9 fps** (2,28 s) |

**Conclusión de la medición:** la cadena FFmpeg+libplacebo **es real y corre a coste 0** en una iGPU; lo que **no** existe es capacidad de cómputo para 4K en el VPS. El límite no es el software: es la caja.

---

## 8. NOT_RUN declarados

| No ejecutado | Causa |
|---|---|
| Compilar FFmpeg/libplacebo | sin toolchain (`cmake`, `gcc`, `make`) en el host |
| `mpv --glsl-shaders`, carga real de shaders `.hook` | `mpv` no instalado; sin shader verificado no se inventa el resultado |
| Real-ESRGAN-ncnn-vulkan (build/run) | no instalado; se midió solo la capacidad Vulkan del host |
| Cualquier medición del VPS (2 GB, sin GPU) | prohibido por `iptv-vps-touch-nothing` |
| Licencias FSRCNNX / SSimSuperRes / KrigBilateral | no se recuperó su `LICENSE`; se declaran **NO VERIFICADO** |
