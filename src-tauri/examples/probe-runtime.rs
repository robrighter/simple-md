// Standalone probe: replicates ai.rs's runtime spawn path against the real
// llama-server + dylibs + gemma4 model, without booting Tauri.
//
// Usage:
//   cargo run --example probe-runtime --manifest-path src-tauri/Cargo.toml
//
// Exits 0 if the runtime reports healthy at /health within 90s.

use std::{path::PathBuf, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    net::TcpListener,
    process::Command,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bin = locate_binary()?;
    let model = locate_model()?;
    println!("[probe] binary: {}", bin.display());
    println!("[probe] model:  {}", model.display());

    let port = pick_free_port().await?;
    println!("[probe] port:   {port}");

    let mut child = Command::new(&bin)
        .arg("--model")
        .arg(&model)
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
        .kill_on_drop(true)
        .spawn()?;

    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                println!("[server stdout] {line}");
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                eprintln!("[server stderr] {line}");
            }
        });
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()?;
    let url = format!("http://127.0.0.1:{port}/health");
    let deadline = std::time::Instant::now() + Duration::from_secs(90);

    let mut healthy = false;
    while std::time::Instant::now() < deadline {
        if let Ok(status) = child.try_wait() {
            if let Some(code) = status {
                eprintln!("[probe] FAIL: server exited with {code}");
                return Err("server exited before /health".into());
            }
        }
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                healthy = true;
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    if !healthy {
        eprintln!("[probe] FAIL: /health did not respond OK within 90s");
        let _ = child.kill().await;
        return Err("health timeout".into());
    }

    println!("[probe] OK: /health responded — runtime is up.");

    // Quick chat-completion smoke
    let body = serde_json::json!({
        "model": "gemma",
        "messages": [{"role": "user", "content": "Reply with exactly: pong"}],
        "stream": false,
        "max_tokens": 8,
        "temperature": 0,
    });
    let resp = client
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .header("content-type", "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await?;
    let status = resp.status();
    let body = resp.text().await?;
    println!("[probe] chat status: {status}");
    println!("[probe] chat body:   {body}");

    let _ = child.kill().await;
    Ok(())
}

async fn pick_free_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn locate_binary() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest
        .join("binaries")
        .join("llama-server-aarch64-apple-darwin");
    if !candidate.exists() {
        return Err(format!("missing {}", candidate.display()).into());
    }
    Ok(candidate)
}

fn locate_model() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let home = std::env::var("HOME")?;
    let candidate = PathBuf::from(home)
        .join("Library/Application Support/com.simplemd.desktop/models/gemma4-e4b.gguf");
    if !candidate.exists() {
        return Err(format!("missing {}", candidate.display()).into());
    }
    Ok(candidate)
}
