mod download;
mod job;

use crate::{export, media, storage};
pub use job::AutomationJob;
use tauri::Emitter;

#[tauri::command]
pub async fn download_youtube(
    url: String,
    quality: String,
    job_id: String,
    paths: tauri::State<'_, storage::StoragePaths>,
    state: tauri::State<'_, export::ExportState>,
    app: tauri::AppHandle,
) -> Result<download::DownloadResult, String> {
    let url = download::youtube_url(&url)?;
    let root = paths.downloads.clone();
    let downloader = media::tool_path(&app, "yt-dlp")?;
    let node = media::tool_path(&app, "node")?;
    let ffmpeg = media::tool_path(&app, "ffmpeg")?;
    let ffprobe = media::tool_path(&app, "ffprobe")?;
    let cancel = state.reserve(&job_id)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        download::download(
            &root,
            &downloader,
            &node,
            &ffmpeg,
            &ffprobe,
            &url,
            &quality,
            &job_id,
            &cancel,
            |progress| {
                let _ = app.emit("automatic-progress", progress);
            },
        )
    })
    .await
    .map_err(|e| e.to_string());
    state.finish();
    result?
}

#[tauri::command]
pub fn automatic_job_request(job: tauri::State<'_, job::AutomationJob>) -> Option<job::JobRequest> {
    job.request.clone()
}

#[tauri::command]
pub fn automatic_job_cancelled(job: tauri::State<'_, job::AutomationJob>) -> bool {
    job.request.is_some() && job.cancelled()
}

#[tauri::command]
pub fn automatic_job_progress(
    stage: String,
    percent: f64,
    job: tauri::State<'_, job::AutomationJob>,
) -> Result<(), String> {
    job.progress(&stage, percent)
}

#[tauri::command]
pub fn automatic_job_finish(
    outcome: serde_json::Value,
    job: tauri::State<'_, job::AutomationJob>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let code = job.finish(outcome)?;
    app.exit(code);
    Ok(())
}

/// Let the launcher resolve the same Windows data and output paths as the editor.
pub fn write_locations(paths: &storage::StoragePaths) -> Result<bool, String> {
    let mut args = std::env::args_os().skip(1);
    while let Some(arg) = args.next() {
        if arg != "--production-paths" {
            continue;
        }
        let path = std::path::PathBuf::from(args.next().ok_or("Falta el archivo de carpetas.")?);
        if !path.is_absolute() {
            return Err("La ruta de carpetas debe ser absoluta.".into());
        }
        let locations = serde_json::json!({
            "dataDir": paths.data,
            "downloadsDir": paths.downloads,
            "exportsDir": export::default_folder()?,
            "jobsDir": paths.data.join("Produccion").join("Trabajos"),
        });
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(&locations).map_err(|e| e.to_string())?)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}
