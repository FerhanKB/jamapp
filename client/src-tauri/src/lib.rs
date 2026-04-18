use std::process::Command;

use tauri::Manager;

#[tauri::command]
async fn resolve_youtube_audio(video_id: String) -> Result<String, String> {
    if !video_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("invalid video id".into());
    }
    let url = format!("https://www.youtube.com/watch?v={}", video_id);
    let output = tokio::task::spawn_blocking(move || {
        Command::new("yt-dlp")
            .args(["-f", "bestaudio", "-g", "--no-warnings", &url])
            .output()
    })
    .await
    .map_err(|e| format!("spawn failed: {e}"))?
    .map_err(|e| format!("yt-dlp failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {stderr}"));
    }
    let stream_url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stream_url.is_empty() {
        return Err("no stream url returned".into());
    }
    Ok(stream_url)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Second launch (including deep-link args): focus existing window.
            // The deep-link plugin (with single-instance feature) handles URL forwarding.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![resolve_youtube_audio])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
