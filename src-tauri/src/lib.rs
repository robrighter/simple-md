mod ai;

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, UNIX_EPOCH},
};

use anyhow::Context;
use reqwest::{header, redirect::Policy, Client};
use serde::Serialize;
use tauri::{Emitter, Manager, State};
use url::Url;

use ai::AiState;

#[derive(Default)]
struct OpenedTargets(Mutex<Vec<String>>);

#[derive(Serialize, Clone)]
#[serde(tag = "kind")]
enum TreeNode {
    #[serde(rename = "directory")]
    Directory {
        name: String,
        path: String,
        children: Vec<TreeNode>,
    },
    #[serde(rename = "file")]
    File {
        name: String,
        path: String,
        extension: Option<String>,
    },
}

#[derive(Serialize)]
struct WorkspaceSnapshot {
    path: String,
    name: String,
    tree: Vec<TreeNode>,
}

#[derive(Serialize)]
struct DocumentPayload {
    path: String,
    name: String,
    content: String,
    version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedDocumentPayload {
    url: String,
    normalized_url: String,
    base_url: String,
    content_type: Option<String>,
    title: String,
    content: String,
}

#[tauri::command]
fn list_workspace(path: String) -> Result<WorkspaceSnapshot, String> {
    let root = PathBuf::from(&path);

    if !root.exists() || !root.is_dir() {
        return Err("The selected workspace folder does not exist.".into());
    }

    let tree = build_tree(&root).map_err(error_to_string)?;

    Ok(WorkspaceSnapshot {
        path: normalize_path(&root),
        name: root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Workspace")
            .to_string(),
        tree,
    })
}

#[tauri::command]
fn open_document(path: String) -> Result<DocumentPayload, String> {
    let target = PathBuf::from(&path);
    let content = fs::read_to_string(&target)
        .with_context(|| format!("Failed to read {}", path))
        .map_err(error_to_string)?;

    Ok(DocumentPayload {
        path: normalize_path(&target),
        name: file_name(&target),
        content,
        version: document_version(&target).map_err(error_to_string)?,
    })
}

#[tauri::command]
fn save_document(
    path: String,
    content: String,
    expected_version: Option<String>,
) -> Result<DocumentPayload, String> {
    let target = PathBuf::from(&path);

    if let Some(expected_version) = expected_version {
        let current_version = document_version(&target).map_err(error_to_string)?;

        if current_version.as_deref() != Some(expected_version.as_str()) {
            return Err("The file changed on disk since it was last loaded.".into());
        }
    }

    fs::write(&target, &content)
        .with_context(|| format!("Failed to save {}", path))
        .map_err(error_to_string)?;

    Ok(DocumentPayload {
        path: normalize_path(&target),
        name: file_name(&target),
        content,
        version: document_version(&target).map_err(error_to_string)?,
    })
}

#[tauri::command]
fn create_note(
    parent_dir: String,
    name: String,
    initial_content: Option<String>,
) -> Result<DocumentPayload, String> {
    let parent = PathBuf::from(&parent_dir);

    if !parent.exists() || !parent.is_dir() {
        return Err("The target folder does not exist.".into());
    }

    let new_file_name = ensure_markdown_extension(validate_leaf_name(name.trim(), "file")?);
    let target = parent.join(new_file_name);

    if target.exists() {
        return Err("A file with that name already exists.".into());
    }

    let content = initial_content.unwrap_or_default();
    fs::write(&target, &content)
        .with_context(|| format!("Failed to create {}", normalize_path(&target)))
        .map_err(error_to_string)?;

    Ok(DocumentPayload {
        path: normalize_path(&target),
        name: file_name(&target),
        content,
        version: document_version(&target).map_err(error_to_string)?,
    })
}

#[tauri::command]
fn create_folder(parent_dir: String, name: String) -> Result<TreeNode, String> {
    let parent = PathBuf::from(&parent_dir);

    if !parent.exists() || !parent.is_dir() {
        return Err("The target folder does not exist.".into());
    }

    let target = parent.join(validate_leaf_name(name.trim(), "folder")?);

    if target.exists() {
        return Err("A folder with that name already exists.".into());
    }

    fs::create_dir_all(&target)
        .with_context(|| format!("Failed to create {}", normalize_path(&target)))
        .map_err(error_to_string)?;

    Ok(TreeNode::Directory {
        name: file_name(&target),
        path: normalize_path(&target),
        children: vec![],
    })
}

#[tauri::command]
fn rename_path(path: String, new_name: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    let parent = target
        .parent()
        .ok_or_else(|| "That item cannot be renamed.".to_string())?;
    let renamed = parent.join(validate_leaf_name(new_name.trim(), "item")?);

    fs::rename(&target, &renamed)
        .with_context(|| format!("Failed to rename {}", path))
        .map_err(error_to_string)?;

    Ok(normalize_path(&renamed))
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);

    if target.is_dir() {
        fs::remove_dir_all(&target)
            .with_context(|| format!("Failed to delete {}", path))
            .map_err(error_to_string)?;
    } else {
        fs::remove_file(&target)
            .with_context(|| format!("Failed to delete {}", path))
            .map_err(error_to_string)?;
    }

    Ok(())
}

#[tauri::command]
fn opened_targets(state: State<'_, OpenedTargets>) -> Vec<String> {
    let mut targets = state.0.lock().unwrap();
    std::mem::take(&mut *targets)
}

#[tauri::command]
fn clear_opened_targets(state: State<'_, OpenedTargets>) {
    state.0.lock().unwrap().clear();
}

#[tauri::command]
async fn fetch_remote_markdown(url: String) -> Result<ImportedDocumentPayload, String> {
    let parsed = Url::parse(&url).map_err(|_| "Please provide a valid URL.".to_string())?;

    if parsed.scheme() != "https" {
        return Err("Only HTTPS URLs are supported.".into());
    }

    let normalized = normalize_markdown_url(parsed)?;
    let client = Client::builder()
        .redirect(Policy::limited(5))
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(error_to_string)?;

    let response = client
        .get(normalized.clone())
        .header(header::USER_AGENT, "Simple MD/0.1")
        .send()
        .await
        .map_err(error_to_string)?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status {}.", response.status()));
    }

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let final_url = response.url().clone();
    let bytes = response.bytes().await.map_err(error_to_string)?;

    if bytes.len() > 10 * 1024 * 1024 {
        return Err("The remote file is larger than the 10 MB import limit.".into());
    }

    let content = String::from_utf8(bytes.to_vec())
        .map_err(|_| "The fetched resource is not valid UTF-8 text.".to_string())?;

    if !looks_like_text_markdown(content_type.as_deref(), &content, final_url.path()) {
        return Err("That URL did not look like a Markdown or text document.".into());
    }

    Ok(ImportedDocumentPayload {
        url,
        normalized_url: final_url.to_string(),
        base_url: base_url(&final_url),
        content_type,
        title: inferred_title(&final_url, &content),
        content,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(OpenedTargets::default())
        .manage(AiState::default());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
            let incoming = normalize_arg_targets(args, Some(PathBuf::from(cwd)));

            if !incoming.is_empty() {
                store_targets(app, incoming);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let current_args =
                normalize_arg_targets(std::env::args().collect(), std::env::current_dir().ok());

            if !current_args.is_empty() {
                store_targets(&app.handle(), current_args);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_workspace,
            open_document,
            save_document,
            create_note,
            create_folder,
            rename_path,
            delete_path,
            fetch_remote_markdown,
            opened_targets,
            clear_opened_targets,
            ai::ai_get_settings,
            ai::ai_accept_license,
            ai::ai_models_status,
            ai::ai_download_model,
            ai::ai_delete_model,
            ai::ai_start_runtime,
            ai::ai_stop_runtime,
            ai::ai_runtime_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let tauri::RunEvent::Opened { urls } = event {
                let incoming = urls.iter().map(|url| url.to_string()).collect::<Vec<_>>();
                store_targets(app, incoming);
            }
        });
}

fn build_tree(root: &Path) -> anyhow::Result<Vec<TreeNode>> {
    let mut directories = Vec::new();
    let mut files = Vec::new();

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let name = file_name(&path);

        if path.is_dir() {
            directories.push(TreeNode::Directory {
                name,
                path: normalize_path(&path),
                children: build_tree(&path)?,
            });
            continue;
        }

        if is_markdown_file(&path) {
            files.push(TreeNode::File {
                name,
                path: normalize_path(&path),
                extension: path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_string()),
            });
        }
    }

    directories.sort_by_key(sort_key);
    files.sort_by_key(sort_key);
    directories.extend(files);

    Ok(directories)
}

fn is_markdown_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()),
        Some(ext) if ["md", "markdown", "mdown", "mkd"].contains(&ext.as_str())
    )
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("untitled")
        .to_string()
}

fn document_version(path: &Path) -> anyhow::Result<Option<String>> {
    let metadata = fs::metadata(path)?;
    let modified = metadata.modified()?.duration_since(UNIX_EPOCH)?.as_nanos();

    Ok(Some(format!("{}:{}", modified, metadata.len())))
}

fn sort_key(node: &TreeNode) -> String {
    match node {
        TreeNode::Directory { name, .. } | TreeNode::File { name, .. } => name.to_ascii_lowercase(),
    }
}

fn error_to_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn ensure_markdown_extension(name: &str) -> String {
    if name.ends_with(".md")
        || name.ends_with(".markdown")
        || name.ends_with(".mdown")
        || name.ends_with(".mkd")
    {
        name.to_string()
    } else {
        format!("{name}.md")
    }
}

fn validate_leaf_name<'a>(name: &'a str, label: &str) -> Result<&'a str, String> {
    if name.is_empty() {
        return Err(format!("The {label} name cannot be empty."));
    }

    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(format!(
            "The {label} name must not contain path separators."
        ));
    }

    Ok(name)
}

fn normalize_markdown_url(url: Url) -> Result<Url, String> {
    if url.domain() == Some("github.com") {
        let segments = url
            .path_segments()
            .map(|segments| segments.map(|value| value.to_string()).collect::<Vec<_>>())
            .unwrap_or_default();

        if segments.len() >= 5 && segments[2] == "blob" {
            let owner = &segments[0];
            let repo = &segments[1];
            let branch = &segments[3];
            let rest = segments[4..].join("/");
            let raw = format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{rest}");
            return Url::parse(&raw).map_err(|_| "Unable to normalize the GitHub file URL.".into());
        }
    }

    Ok(url)
}

fn looks_like_text_markdown(content_type: Option<&str>, content: &str, path: &str) -> bool {
    if let Some(content_type) = content_type {
        if content_type.contains("text/markdown") || content_type.contains("text/plain") {
            return true;
        }
    }

    if is_markdown_path(path) {
        return true;
    }

    let clues = ["# ", "## ", "- ", "* ", "```", "$$", "|", "[", "]("];
    clues.iter().filter(|clue| content.contains(**clue)).count() >= 2
}

fn is_markdown_path(path: &str) -> bool {
    [".md", ".markdown", ".mdown", ".mkd"]
        .iter()
        .any(|ext| path.to_ascii_lowercase().ends_with(ext))
}

fn inferred_title(url: &Url, content: &str) -> String {
    if let Some(heading) = content
        .lines()
        .map(|line| line.trim())
        .find(|line| line.starts_with("# "))
    {
        return heading.trim_start_matches("# ").trim().to_string();
    }

    url.path_segments()
        .and_then(|segments| segments.last())
        .filter(|value| !value.is_empty())
        .unwrap_or("Imported Markdown")
        .to_string()
}

fn base_url(url: &Url) -> String {
    let mut base = url.clone();

    if let Ok(mut segments) = base.path_segments_mut() {
        segments.pop_if_empty();
        segments.pop();
    }

    base.to_string()
}

fn normalize_arg_targets(args: Vec<String>, cwd: Option<PathBuf>) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter_map(|arg| {
            if arg.starts_with('-') {
                return None;
            }

            if arg.starts_with("file://") {
                return Some(arg);
            }

            let candidate = PathBuf::from(&arg);

            if candidate.exists() {
                return Some(normalize_path(&candidate));
            }

            cwd.as_ref()
                .map(|cwd| cwd.join(&arg))
                .filter(|path| path.exists())
                .map(|path| normalize_path(&path))
        })
        .collect()
}

fn store_targets<R: tauri::Runtime>(app: &tauri::AppHandle<R>, incoming: Vec<String>) {
    let state = app.state::<OpenedTargets>();
    let mut state = state.0.lock().unwrap();
    let mut fresh = Vec::new();

    for target in incoming {
        if !state.contains(&target) {
            state.push(target.clone());
        }

        fresh.push(target);
    }

    if !fresh.is_empty() {
        let _ = app.emit("opened", fresh);
    }
}
