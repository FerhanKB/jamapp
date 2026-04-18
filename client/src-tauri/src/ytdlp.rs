use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

/// Cached path to the yt-dlp binary (system PATH or app-managed).
static YT_DLP_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn lock() -> &'static Mutex<Option<PathBuf>> {
    YT_DLP_PATH.get_or_init(|| Mutex::new(None))
}

/// Platform-specific download URL for the latest yt-dlp release.
fn download_url() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    }
    #[cfg(target_os = "linux")]
    {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"
    }
    #[cfg(target_os = "macos")]
    {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
    }
}

fn binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    }
}

/// Check whether `yt-dlp` works when invoked at the given path.
fn probe(path: &Path) -> bool {
    Command::new(path)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

async fn download_to(dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    let url = download_url();
    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("download yt-dlp: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download yt-dlp: HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("read yt-dlp bytes: {e}"))?;
    std::fs::write(dest, &bytes).map_err(|e| format!("write yt-dlp: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(dest)
            .map_err(|e| format!("stat yt-dlp: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(dest, perms)
            .map_err(|e| format!("chmod yt-dlp: {e}"))?;
    }
    Ok(())
}

/// Resolve the path to a working yt-dlp, downloading into the app data dir if needed.
pub async fn ensure(app: &AppHandle) -> Result<PathBuf, String> {
    {
        let guard = lock().lock().await;
        if let Some(path) = guard.as_ref() {
            if probe(path) {
                return Ok(path.clone());
            }
        }
    }

    // 1) Try system PATH.
    let system = PathBuf::from(binary_name());
    if probe(&system) {
        let mut guard = lock().lock().await;
        *guard = Some(system.clone());
        return Ok(system);
    }

    // 2) Check app-managed binary from a previous run.
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    let managed = app_dir.join("bin").join(binary_name());
    if managed.exists() && probe(&managed) {
        let mut guard = lock().lock().await;
        *guard = Some(managed.clone());
        return Ok(managed);
    }

    // 3) Download into the app data dir.
    download_to(&managed).await?;
    if !probe(&managed) {
        return Err("yt-dlp downloaded but failed to execute".into());
    }
    let mut guard = lock().lock().await;
    *guard = Some(managed.clone());
    Ok(managed)
}
