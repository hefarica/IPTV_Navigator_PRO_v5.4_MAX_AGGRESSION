//! hotpath-injector — Inyector de headers en hot-path para listas .m3u8 (truth-guarded).
//!
//! DOCTRINA (ver README.md):
//!  - Solo headers HTTP REALES (User-Agent, Referer, Accept, Connection...).
//!    PROHIBIDO inyectar X-Priority/X-Stream-Quality/X-CMAF-Optimized hacia providers:
//!    los origins no los interpretan (mentira inerte — NO PLAYER-BREAKING LIES).
//!  - CMAF/LL-HLS NO se "activan" por header: requieren EXT-X-MAP/fMP4 y EXT-X-PART del
//!    ORIGIN. Este binario jamás declara CMAF falso.
//!  - Cap EXTHTTP = 8 KB por canal (política _sanitizePayloadSize del generador).
//!    Si el upsert excede el cap, se omite la inyección (nunca truncar JSON).
//!  - Perfil por canal: resuelto desde el PROPIO bloque (#EXT-X-APE-PROFILE:<id>) o el
//!    default del metadata — NUNCA desde el path de la URL.
//!  - Hot-path sin locks: metadata inmutable en Arc, cargada una vez al inicio.
//!  - NO es proxy de segmentos: la autopista nginx queda intocada. Esto SIRVE la lista.
//!
//! Modos:
//!  hotpath-injector --metadata metadata.json --listen 127.0.0.1:8081 --lists-dir /ruta
//!  hotpath-injector --metadata metadata.json --bench   (µs reales medidos en el host)

use bytes::Bytes;
use futures_core::Stream;
use http_body_util::StreamBody;
use hyper::body::Frame;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde::Deserialize;
use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Instant;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::mpsc::Receiver;

const EXTHHTTP_PREFIX: &str = "#EXTHTTP:";
const EXTHHTTP_CAP_BYTES: usize = 8 * 1024;
const PROFILE_TAG: &str = "#EXT-X-APE-PROFILE:";

type RespBody = StreamBody<MpscStream>;
type Resp = Response<RespBody>;

#[derive(Deserialize, Clone, Default)]
struct Profile {
    /// Headers HTTP reales a upsert en el #EXTHTTP:{json} del canal.
    exthttp: Option<HashMap<String, String>>,
    /// EXTVLCOPT a upsert (p.ej. "clock-synchro": "1", "audio-time-stretch": "1").
    vlcopt: Option<HashMap<String, String>>,
}

#[derive(Deserialize)]
struct Metadata {
    default_profile: String,
    profiles: HashMap<String, Profile>,
}

struct App {
    meta: Metadata,
    lists_dir: PathBuf,
}

// ─── Hot-path puro: transformación de líneas (sin I/O, sin locks, sin await) ───

#[derive(Default)]
struct ChannelCtx {
    profile: Option<String>,
    saw_exthttp: bool,
}

impl App {
    fn profile_for(&self, ctx: &ChannelCtx) -> Profile {
        let id = ctx
            .profile
            .as_deref()
            .unwrap_or(self.meta.default_profile.as_str());
        self.meta.profiles.get(id).cloned().unwrap_or_default()
    }
}

fn upsert_exthttp(line: &str, prof: &Profile) -> Option<String> {
    let headers = prof.exthttp.as_ref()?;
    if headers.is_empty() {
        return None;
    }
    let raw = line.get(EXTHHTTP_PREFIX.len()..)?.trim();
    let mut obj: serde_json::Map<String, serde_json::Value> = if raw.is_empty() {
        serde_json::Map::new()
    } else {
        serde_json::from_str(raw).ok()?
    };
    for (k, v) in headers {
        obj.insert(k.clone(), serde_json::Value::String(v.clone()));
    }
    let out = format!("{EXTHHTTP_PREFIX}{}", serde_json::to_string(&obj).ok()?);
    (out.len() <= EXTHHTTP_CAP_BYTES).then_some(out)
}

fn synthesize_exthttp(prof: &Profile) -> Option<String> {
    let headers = prof.exthttp.as_ref()?;
    if headers.is_empty() {
        return None;
    }
    let obj: serde_json::Map<String, serde_json::Value> = headers
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
        .collect();
    let out = format!("{EXTHHTTP_PREFIX}{}", serde_json::to_string(&obj).ok()?);
    (out.len() <= EXTHHTTP_CAP_BYTES).then_some(out)
}

/// Devuelve las líneas a emitir por esta línea de entrada (1 normalmente;
/// 2 cuando se sintetiza el #EXTHTTP faltante antes de la URL del canal).
fn transform_line(line: &str, ctx: &mut ChannelCtx, app: &App) -> Vec<String> {
    if line.starts_with("#EXTINF") {
        *ctx = ChannelCtx::default();
        return vec![line.to_string()];
    }
    if !line.is_empty() && !line.starts_with('#') {
        // URL del canal → fin del bloque.
        let prof = app.profile_for(ctx);
        let mut out = Vec::with_capacity(2);
        if !ctx.saw_exthttp {
            if let Some(h) = synthesize_exthttp(&prof) {
                out.push(h);
            }
        }
        *ctx = ChannelCtx::default();
        out.push(line.to_string());
        return out;
    }
    if let Some(id) = line.strip_prefix(PROFILE_TAG) {
        ctx.profile = Some(id.trim().to_string());
        return vec![line.to_string()];
    }
    if line.starts_with(EXTHHTTP_PREFIX) {
        ctx.saw_exthttp = true;
        let prof = app.profile_for(ctx);
        let nl = upsert_exthttp(line, &prof).unwrap_or_else(|| line.to_string());
        return vec![nl];
    }
    if let Some(body) = line.strip_prefix("#EXTVLCOPT:") {
        if let Some(key) = body.split('=').next() {
            if let Some(val) = app
                .profile_for(ctx)
                .vlcopt
                .as_ref()
                .and_then(|m| m.get(key))
            {
                return vec![format!("#EXTVLCOPT:{key}={val}")];
            }
        }
        return vec![line.to_string()];
    }
    vec![line.to_string()]
}

// ─── Adaptador mpsc → futures_core::Stream ───

struct MpscStream(Receiver<io::Result<Frame<Bytes>>>);

impl Stream for MpscStream {
    type Item = io::Result<Frame<Bytes>>;
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.0.poll_recv(cx)
    }
}

fn stream_body(rx: Receiver<io::Result<Frame<Bytes>>>) -> RespBody {
    StreamBody::new(MpscStream(rx))
}

fn empty_body() -> RespBody {
    let (_tx, rx) = tokio::sync::mpsc::channel(1);
    stream_body(rx)
}

fn resp(status: StatusCode, body: RespBody) -> Resp {
    Response::builder()
        .status(status)
        .header("content-type", "application/vnd.apple.mpegurl")
        .header("cache-control", "no-cache")
        .body(body)
        .unwrap()
}

async fn serve_list(app: &App, name: &str) -> io::Result<Resp> {
    if name.contains("..") || name.contains('/') || name.contains('\\') || name.is_empty() {
        return Ok(resp(StatusCode::BAD_REQUEST, empty_body()));
    }
    let file = tokio::fs::File::open(app.lists_dir.join(name)).await?;
    let mut lines = BufReader::new(file).lines();
    let (tx, rx) = tokio::sync::mpsc::channel::<io::Result<Frame<Bytes>>>(256);
    tokio::spawn(async move {
        let mut ctx = ChannelCtx::default();
        while let Ok(Some(line)) = lines.next_line().await {
            for nl in transform_line(&line, &mut ctx) {
                if tx.send(Ok(Frame::data(Bytes::from(format!("{nl}\r\n"))))).await.is_err() {
                    break; // cliente se fue
                }
            }
        }
    });
    Ok(resp(StatusCode::OK, stream_body(rx)))
}

// ─── CLI ───

fn flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .map(|s| s.as_str())
}

fn bench(app: &App) {
    let block: Vec<&str> = vec![
        "#EXTINF:-1 tvg-id=\"x\" tvg-name=\"CH TEST\",CH TEST",
        PROFILE_TAG,
        "#EXT-X-STREAM-INF:BANDWIDTH=9000000,STABLE-VARIANT-ID=\"ch_1_P3\"",
        "#EXTVLCOPT:clock-synchro=0",
        "#EXTVLCOPT:network-caching=5000",
        "#EXTHTTP:{\"User-Agent\":\"Mozilla/5.0\",\"Accept\":\"*/*\"}",
        "#EXTVLCOPT:http-reconnect=true",
        "http://example.invalid/live/stream.m3u8",
    ];
    // Nota: PROFILE_TAG se reemplaza abajo por un perfil real para el bench.
    let block: Vec<String> = block
        .into_iter()
        .map(|l| if l == PROFILE_TAG { format!("{PROFILE_TAG}P3") } else { l.to_string() })
        .collect();
    const N: usize = 100_000;
    let mut samples: Vec<f64> = Vec::with_capacity(N);
    for _ in 0..N {
        let mut ctx = ChannelCtx::default();
        let t0 = Instant::now();
        for l in &block {
            let _ = transform_line(l, &mut ctx, app);
        }
        samples.push(t0.elapsed().as_secs_f64() * 1e6);
    }
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let at = |q: f64| samples[((samples.len() - 1) as f64 * q) as usize];
    println!(
        "[bench] bloque de canal (8 líneas): p50={:.2}µs p99={:.2}µs max={:.2}µs (n={N})",
        at(0.50),
        at(0.99),
        samples[N - 1]
    );
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let meta_path = flag(&args, "--metadata").expect("--metadata <metadata.json> requerido");
    let raw = std::fs::read_to_string(meta_path).expect("leer metadata");
    let meta: Metadata = serde_json::from_str(&raw).expect("parsear metadata (schema en README)");
    let app = Arc::new(App {
        meta,
        lists_dir: PathBuf::from(flag(&args, "--lists-dir").unwrap_or(".")),
    });

    if args.iter().any(|a| a == "--bench") {
        bench(&app);
        return;
    }

    let addr = flag(&args, "--listen").unwrap_or("127.0.0.1:8081").to_string();
    let listener = TcpListener::bind(&addr).await.expect("bind");
    eprintln!("[hotpath-injector] escuchando en http://{addr}/<nombre>.m3u8 (lists-dir: {:?})", app.lists_dir);

    loop {
        let (stream, _) = listener.accept().await.expect("accept");
        let io = TokioIo::new(stream);
        let app = Arc::clone(&app);
        tokio::spawn(async move {
            let svc = service_fn(move |req: Request<hyper::body::Incoming>| {
                let app = Arc::clone(&app);
                let name = req.uri().path().trim_start_matches('/').to_string();
                async move {
                    if req.method() != "GET" {
                        return Ok(resp(StatusCode::METHOD_NOT_ALLOWED, empty_body()));
                    }
                    match serve_list(&app, &name).await {
                        Ok(r) => Ok(r),
                        Err(_) => Ok(resp(StatusCode::NOT_FOUND, empty_body())),
                    }
                }
            });
            let _ = http1::Builder::new().serve_connection(io, svc).await;
        });
    }
}
