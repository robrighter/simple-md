use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpListener,
    process::{Child, Command},
    sync::Mutex as AsyncMutex,
};

const SETTINGS_FILE: &str = "ai-settings.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Variant {
    Gemma4E2b,
    Gemma4E4b,
}

impl Variant {
    fn as_str(self) -> &'static str {
        match self {
            Variant::Gemma4E2b => "gemma4-e2b",
            Variant::Gemma4E4b => "gemma4-e4b",
        }
    }

    // Official ggml-org GGUF builds (public, ungated). E2B only ships Q8_0/BF16
    // upstream; E4B has Q4_K_M as well, so we pick the smallest practical quant
    // for each: Q8_0 for E2B (no smaller quant available), Q4_K_M for E4B.
    fn download_url(self) -> &'static str {
        match self {
            Variant::Gemma4E2b => {
                "https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q8_0.gguf"
            }
            Variant::Gemma4E4b => {
                "https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf"
            }
        }
    }

    pub fn model_card_url(self) -> &'static str {
        match self {
            Variant::Gemma4E2b => "https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF",
            Variant::Gemma4E4b => "https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF",
        }
    }
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AiSettings {
    license_accepted: bool,
    default_variant: Option<Variant>,
}

#[derive(Default)]
pub struct AiState {
    settings: Mutex<AiSettings>,
    runtime: AsyncMutex<Option<RuntimeHandle>>,
}

struct RuntimeHandle {
    variant: Variant,
    port: u16,
    child: Child,
}

#[derive(Serialize)]
pub struct ModelStatus {
    variant: Variant,
    installed: bool,
    bytes: Option<u64>,
    path: Option<String>,
}

#[derive(Serialize)]
pub struct RuntimeStatus {
    running: bool,
    variant: Option<Variant>,
    port: Option<u16>,
}

#[derive(Serialize, Clone)]
struct DownloadProgress {
    variant: Variant,
    received: u64,
    total: Option<u64>,
    done: bool,
    error: Option<String>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("Failed to resolve app data directory")?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(SETTINGS_FILE))
}

fn models_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("Failed to resolve app data directory")?
        .join("models");
    std::fs::create_dir_all(&dir).ok();
    Ok(dir)
}

fn model_file(app: &AppHandle, variant: Variant) -> Result<PathBuf> {
    Ok(models_dir(app)?.join(format!("{}.gguf", variant.as_str())))
}

fn read_settings(app: &AppHandle) -> AiSettings {
    let Ok(path) = settings_path(app) else {
        return AiSettings::default();
    };

    std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_settings(app: &AppHandle, settings: &AiSettings) -> Result<()> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, raw).context("Failed to persist AI settings")?;
    Ok(())
}

#[tauri::command]
pub fn ai_get_settings(app: AppHandle, state: State<'_, AiState>) -> AiSettings {
    let settings = read_settings(&app);
    *state.settings.lock().unwrap() = settings.clone();
    settings
}

#[tauri::command]
pub fn ai_accept_license(app: AppHandle, state: State<'_, AiState>) -> Result<AiSettings, String> {
    let mut settings = state.settings.lock().unwrap().clone();
    settings.license_accepted = true;
    write_settings(&app, &settings).map_err(error_to_string)?;
    *state.settings.lock().unwrap() = settings.clone();
    Ok(settings)
}

#[tauri::command]
pub fn ai_models_status(app: AppHandle) -> Vec<ModelStatus> {
    [Variant::Gemma4E2b, Variant::Gemma4E4b]
        .into_iter()
        .map(|variant| {
            let Ok(path) = model_file(&app, variant) else {
                return ModelStatus {
                    variant,
                    installed: false,
                    bytes: None,
                    path: None,
                };
            };
            let bytes = std::fs::metadata(&path).ok().map(|meta| meta.len());
            ModelStatus {
                variant,
                installed: bytes.is_some(),
                bytes,
                path: Some(path.to_string_lossy().to_string()),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn ai_download_model(app: AppHandle, variant: Variant) -> Result<String, String> {
    let target = model_file(&app, variant).map_err(error_to_string)?;

    if !read_settings(&app).license_accepted {
        return Err("Accept the Gemma terms before downloading.".into());
    }

    let url = variant.download_url();
    let temp = target.with_extension("gguf.part");

    let result = stream_download(&app, variant, url, &temp).await;

    match result {
        Ok(()) => {
            tokio::fs::rename(&temp, &target)
                .await
                .map_err(error_to_string)?;
            emit_progress(
                &app,
                DownloadProgress {
                    variant,
                    received: tokio::fs::metadata(&target)
                        .await
                        .map(|meta| meta.len())
                        .unwrap_or(0),
                    total: None,
                    done: true,
                    error: None,
                },
            );
            Ok(target.to_string_lossy().to_string())
        }
        Err(err) => {
            // Best-effort cleanup of the partial file.
            let _ = tokio::fs::remove_file(&temp).await;
            let message = err.to_string();
            emit_progress(
                &app,
                DownloadProgress {
                    variant,
                    received: 0,
                    total: None,
                    done: true,
                    error: Some(message.clone()),
                },
            );
            Err(message)
        }
    }
}

async fn stream_download(
    app: &AppHandle,
    variant: Variant,
    url: &str,
    target: &Path,
) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60 * 60))
        .build()?;

    let mut request = client.get(url);
    if let Ok(token) = std::env::var("HF_TOKEN") {
        if !token.is_empty() {
            request = request.bearer_auth(token);
        }
    }

    let response = request.send().await?;

    if !response.status().is_success() {
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED
            || status == reqwest::StatusCode::FORBIDDEN
        {
            return Err(anyhow::anyhow!(
                "Hugging Face returned {}. The repo {} appears to be gated; set HF_TOKEN in your environment after accepting the license.",
                status,
                variant.model_card_url(),
            ));
        }
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(anyhow::anyhow!(
                "{} returned 404 — the GGUF file isn't at this path. Update the URL in src-tauri/src/ai.rs.",
                url,
            ));
        }
        return Err(anyhow::anyhow!("Download failed with status {}.", status));
    }
    let total = response.content_length();
    let mut file = tokio::fs::File::create(target).await?;
    let mut stream = response.bytes_stream();
    let mut received: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        received += chunk.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(150) {
            emit_progress(
                app,
                DownloadProgress {
                    variant,
                    received,
                    total,
                    done: false,
                    error: None,
                },
            );
            last_emit = std::time::Instant::now();
        }
    }

    file.flush().await?;
    Ok(())
}

fn emit_progress(app: &AppHandle, progress: DownloadProgress) {
    let _ = app.emit("ai:download", progress);
}

#[tauri::command]
pub async fn ai_delete_model(app: AppHandle, variant: Variant) -> Result<(), String> {
    let path = model_file(&app, variant).map_err(error_to_string)?;
    if path.exists() {
        tokio::fs::remove_file(&path).await.map_err(error_to_string)?;
    }
    Ok(())
}

async fn pick_free_port() -> Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

// Locates the llama-server binary alongside its companion dylibs.
//
// We deliberately do NOT use Tauri's sidecar mechanism here. Sidecar copies the
// binary into target/<profile>/ at dev time, but the llama.cpp dylibs (libllama,
// libggml, libmtmd, etc.) it depends on aren't co-located there. The binary is
// linked with `@rpath = @loader_path`, so dyld looks for the dylibs in the same
// directory as the executable and fails to load. Running directly from
// src-tauri/binaries/ keeps the binary next to its dylibs.
//
// In dev: resolve relative to the manifest dir from CARGO_MANIFEST_DIR.
// In a packaged app: resolve relative to the executable's parent (Resources
// dir on macOS, exe dir on Windows). We support both via `resource_dir()` /
// fallback to the dev path.
fn locate_llama_server(app: &AppHandle) -> Result<PathBuf, String> {
    let triple = current_target_triple();
    let bin_name = format!("llama-server-{triple}");

    // macOS packaged app: Tauri places externalBin entries in Contents/MacOS
    // and strips the target-triple suffix. The llama.cpp dylibs must be copied
    // beside this executable because it uses @rpath/@loader_path.
    #[cfg(target_os = "macos")]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(mac_os_dir) = exe.parent() {
            let candidate = mac_os_dir.join("llama-server");
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    // Packaged app: alongside other resources.
    if let Ok(resource_dir) = app.path().resource_dir() {
        // Windows: Tauri strips the target triple suffix when installing the
        // sidecar, so the binary lands as "llama-server.exe" directly in the
        // install directory (which is what resource_dir() returns on Windows).
        #[cfg(target_os = "windows")]
        {
            let candidate = resource_dir.join("llama-server.exe");
            if candidate.exists() {
                return Ok(candidate);
            }
        }

        let candidate = resource_dir.join("binaries").join(&bin_name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    // Dev: walk up from the running executable to find the project root.
    if let Ok(exe) = std::env::current_exe() {
        // exe sits at .../src-tauri/target/<profile>/simple_md.
        let mut cur = exe.as_path();
        for _ in 0..6 {
            if let Some(parent) = cur.parent() {
                let candidate = parent.join("src-tauri").join("binaries").join(&bin_name);
                if candidate.exists() {
                    return Ok(candidate);
                }
                cur = parent;
            } else {
                break;
            }
        }
    }

    Err(format!(
        "Could not find {bin_name}. Run `npm run ai:fetch-sidecar` to install it."
    ))
}

const fn current_target_triple() -> &'static str {
    // Matches the triple component used by `npm run ai:fetch-sidecar`.
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else {
        "unknown"
    }
}

#[tauri::command]
pub async fn ai_start_runtime(
    app: AppHandle,
    state: State<'_, AiState>,
    variant: Variant,
) -> Result<RuntimeStatus, String> {
    let mut guard = state.runtime.lock().await;

    if let Some(existing) = guard.as_ref() {
        if existing.variant == variant {
            return Ok(RuntimeStatus {
                running: true,
                variant: Some(existing.variant),
                port: Some(existing.port),
            });
        }
    }

    if let Some(mut existing) = guard.take() {
        let _ = existing.child.kill().await;
    }

    let model_path = model_file(&app, variant).map_err(error_to_string)?;
    if !model_path.exists() {
        return Err("Model is not installed yet.".into());
    }

    let bin_path = locate_llama_server(&app)?;
    let port = pick_free_port().await.map_err(error_to_string)?;

    let mut command = Command::new(&bin_path);
    command
        .arg("--model")
        .arg(&model_path)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--ctx-size")
        .arg("4096")
        .arg("--n-gpu-layers")
        .arg("99")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn llama-server: {e}"))?;

    // Capture stderr so we can surface a real error if startup fails.
    let stderr = child.stderr.take();
    let stderr_buffer = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    if let Some(stderr) = stderr {
        let buf = stderr_buffer.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let mut guard = buf.lock().unwrap();
                if guard.len() < 8192 {
                    guard.push_str(&line);
                    guard.push('\n');
                }
            }
        });
    }

    // Drain stdout into the void so the pipe doesn't fill up.
    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(_)) = reader.next_line().await {}
        });
    }

    // Race: did the process die early, or is it serving /health?
    let healthy = wait_for_health_or_exit(&mut child, port, Duration::from_secs(120)).await;

    match healthy {
        Ok(true) => {
            *guard = Some(RuntimeHandle {
                variant,
                port,
                child,
            });
            Ok(RuntimeStatus {
                running: true,
                variant: Some(variant),
                port: Some(port),
            })
        }
        Ok(false) => {
            let _ = child.kill().await;
            Err("Runtime did not become ready within 120s.".into())
        }
        Err(exit_status) => {
            let stderr_tail = stderr_buffer.lock().unwrap().clone();
            let trimmed = stderr_tail.trim();
            let detail = if trimmed.is_empty() {
                String::from("(no stderr output)")
            } else {
                // Keep the last few lines; that's where the real error usually sits.
                let lines: Vec<&str> = trimmed.lines().rev().take(8).collect();
                lines.into_iter().rev().collect::<Vec<_>>().join("\n")
            };
            Err(format!(
                "llama-server exited early ({exit_status}). Tail of stderr:\n\n{detail}"
            ))
        }
    }
}

// Polls /health while watching the child process. Returns:
// - Ok(true)  if /health responds 200 within the timeout
// - Ok(false) if the timeout hits without success and the child is still alive
// - Err(exit) if the child exits before /health succeeds
async fn wait_for_health_or_exit(
    child: &mut Child,
    port: u16,
    timeout: Duration,
) -> Result<bool, std::process::ExitStatus> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .expect("reqwest client builder");

    let url = format!("http://127.0.0.1:{port}/health");
    let deadline = std::time::Instant::now() + timeout;

    while std::time::Instant::now() < deadline {
        // Did the child die?
        match child.try_wait() {
            Ok(Some(status)) => return Err(status),
            Ok(None) => {}
            Err(_) => {}
        }

        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                return Ok(true);
            }
        }

        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    Ok(false)
}

#[tauri::command]
pub async fn ai_stop_runtime(state: State<'_, AiState>) -> Result<(), String> {
    let mut guard = state.runtime.lock().await;
    if let Some(mut handle) = guard.take() {
        let _ = handle.child.kill().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn ai_runtime_status(state: State<'_, AiState>) -> Result<RuntimeStatus, String> {
    let guard = state.runtime.lock().await;
    Ok(match guard.as_ref() {
        Some(handle) => RuntimeStatus {
            running: true,
            variant: Some(handle.variant),
            port: Some(handle.port),
        },
        None => RuntimeStatus {
            running: false,
            variant: None,
            port: None,
        },
    })
}

fn error_to_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}
