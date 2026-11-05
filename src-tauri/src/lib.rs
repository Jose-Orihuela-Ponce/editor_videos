mod automatic;
mod export;
mod media;
mod model;
mod presets;
mod repository;
mod storage;

use model::{Orientation, Project};
use repository::{Document, Library, Repository};
use serde::Serialize;
use std::{path::Path, process::Command};
#[cfg(debug_assertions)]
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[tauri::command]
async fn get_library(repo: tauri::State<'_, Repository>) -> Result<Library, String> {
    repo.library()
}

#[tauri::command]
async fn download_youtube(
    url: String,
    quality: String,
    job_id: String,
    paths: tauri::State<'_, storage::StoragePaths>,
    state: tauri::State<'_, export::ExportState>,
    app: tauri::AppHandle,
) -> Result<automatic::DownloadResult, String> {
    let url = automatic::youtube_url(&url)?;
    let root = paths.downloads.clone();
    let downloader = media::tool_path(&app, "yt-dlp")?;
    let node = media::tool_path(&app, "node")?;
    let ffmpeg = media::tool_path(&app, "ffmpeg")?;
    let ffprobe = media::tool_path(&app, "ffprobe")?;
    let cancel = state.reserve(&job_id)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        automatic::download(
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
async fn get_automatic_tools(app: tauri::AppHandle) -> Vec<ToolStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        ["yt-dlp", "node"].iter().map(|name| {
            let result = media::tool_path(&app, name).and_then(|path| {
                let output = media::command(&path).arg("--version").output().map_err(|e| e.to_string())?;
                if !output.status.success() { return Err(format!("No se pudo ejecutar {name}.")); }
                Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
            });
            ToolStatus {
                name: name.to_string(), available: result.is_ok(),
                version: result.unwrap_or_else(|_| format!("El motor de descarga no está disponible ({name}). Reinstala la versión completa de la aplicación.")),
            }
        }).collect()
    }).await.unwrap_or_default()
}

#[tauri::command]
fn reveal_automatic_output(path: String) -> Result<(), String> {
    let path = media::local_path(Path::new(&path))?;
    if path.extension().and_then(|s| s.to_str()) != Some("mp4") {
        return Err("Selecciona un video MP4 exportado.".into());
    }
    media::command(Path::new("explorer.exe"))
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_preset(
    orientation: Orientation,
    repo: tauri::State<'_, Repository>,
) -> Result<presets::Preset, String> {
    presets::load(&repo, orientation)
}
#[tauri::command]
fn save_preset(
    orientation: Orientation,
    preset: presets::Preset,
    repo: tauri::State<'_, Repository>,
) -> Result<presets::Preset, String> {
    presets::save(&repo, orientation, preset)
}

#[tauri::command]
fn get_export_folder() -> Result<String, String> {
    Ok(export::default_folder()?.to_string_lossy().into())
}

#[tauri::command]
fn new_project(name: String, orientation: Orientation) -> Result<Project, String> {
    let project = Project::new(name.trim().to_string(), orientation);
    project.validate()?;
    Ok(project)
}

#[tauri::command]
fn missing_media(project: Project) -> Vec<String> {
    project
        .media
        .iter()
        .filter(|m| media::local_path(Path::new(&m.path)).is_err())
        .map(|m| m.id.clone())
        .collect()
}

#[tauri::command]
async fn prepare_proxy(
    path: String,
    repo: tauri::State<'_, Repository>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let root = repo.root.clone();
    let ffmpeg = media::tool_path(&app, "ffmpeg")?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        media::proxy(Path::new(&path), &ffmpeg, &root)
    })
    .await
    .map_err(|e| e.to_string())??;
    app.asset_protocol_scope()
        .allow_file(&result)
        .map_err(|e| e.to_string())?;
    Ok(result.to_string_lossy().into())
}

#[tauri::command]
async fn open_project(
    file_path: String,
    repo: tauri::State<'_, Repository>,
    app: tauri::AppHandle,
) -> Result<Document, String> {
    let document = repo.open(Path::new(&file_path))?;
    media::authorize(&document.project, &app);
    Ok(document)
}

#[tauri::command]
async fn import_media(
    paths: Vec<String>,
    repo: tauri::State<'_, Repository>,
    app: tauri::AppHandle,
) -> Result<media::ImportResult, String> {
    let root = repo.root.clone();
    tauri::async_runtime::spawn_blocking(move || media::import(paths, root, app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_project(
    project: Project,
    plan: export::RenderPlan,
    options: export::ExportOptions,
    job_id: String,
    repo: tauri::State<'_, Repository>,
    state: tauri::State<'_, export::ExportState>,
    app: tauri::AppHandle,
) -> Result<export::ExportResult, String> {
    let root = repo.root.clone();
    let ffmpeg = media::tool_path(&app, "ffmpeg")?;
    let cancel = state.reserve(&job_id)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let report_app = app.clone();
        let report: std::sync::Arc<dyn Fn(export::Progress) + Send + Sync> =
            std::sync::Arc::new(move |progress| {
                let _ = report_app.emit("export-progress", progress);
            });
        let encoders = if options.hardware && options.format == "mp4" {
            if let Some(values) = app.state::<export::ExportState>().known_encoders() {
                values
            } else {
                report(export::Progress {
                    job_id: job_id.clone(),
                    percent: 0.0,
                    stage: "Comprobando aceleración".into(),
                    encoder: String::new(),
                });
                let values = export::supported_encoders(&ffmpeg, &cancel);
                if !cancel.load(std::sync::atomic::Ordering::SeqCst) {
                    app.state::<export::ExportState>()
                        .remember_encoders(values.clone());
                }
                values
            }
        } else {
            vec![]
        };
        export::render(
            &root, &ffmpeg, &project, &plan, &options, &job_id, cancel, &encoders, report,
        )
    })
    .await
    .map_err(|e| e.to_string());
    state.finish();
    result?
}

#[tauri::command]
fn cancel_export(
    job_id: String,
    state: tauri::State<'_, export::ExportState>,
) -> Result<(), String> {
    state.cancel(&job_id)
}

#[tauri::command]
async fn save_project(
    project: Project,
    file_path: Option<String>,
    repo: tauri::State<'_, Repository>,
) -> Result<Document, String> {
    repo.save(project, file_path.as_deref().map(Path::new))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolStatus {
    name: String,
    available: bool,
    version: String,
}

#[tauri::command]
async fn get_tools(app: tauri::AppHandle) -> Vec<ToolStatus> {
    ["ffmpeg", "ffprobe"]
        .iter()
        .map(|name| {
            let bundled = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.join(format!("{name}.exe"))));
            let path = bundled.filter(|p| p.exists()).or_else(|| {
                app.path()
                    .resource_dir()
                    .ok()
                    .map(|p| p.join(format!("{name}.exe")))
            });
            #[cfg(debug_assertions)]
            let path = path.filter(|p| p.exists()).or_else(|| {
                Some(
                    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .join("binaries")
                        .join(format!("{name}-x86_64-pc-windows-msvc.exe")),
                )
            });
            let result = path
                .ok_or_else(|| "No se encontró el binario incluido.".into())
                .and_then(|path| {
                    let mut command = Command::new(path);
                    command.arg("-version");
                    #[cfg(windows)]
                    {
                        use std::os::windows::process::CommandExt;
                        command.creation_flags(0x08000000);
                    }
                    command
                        .output()
                        .map_err(|e| format!("No se pudo iniciar: {e}"))
                        .and_then(|output| {
                            if !output.status.success() {
                                return Err("El proceso no se inició correctamente.".into());
                            }
                            Ok(String::from_utf8_lossy(&output.stdout)
                                .lines()
                                .next()
                                .unwrap_or("Versión desconocida")
                                .to_string())
                        })
                });
            ToolStatus {
                name: name.to_string(),
                available: result.is_ok(),
                version: result.unwrap_or_else(|e| e),
            }
        })
        .collect()
}

pub fn run() {
    let paths = storage::StoragePaths::resolve().expect("No se pudieron localizar las carpetas de Editor");
    let webview_directory = paths.data.join("WebView");
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Repository::new(paths.data.clone()))
        .manage(paths)
        .manage(export::ExportState::default())
        .setup(move |app| {
            std::fs::create_dir_all(&webview_directory)?;
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .data_directory(webview_directory)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library,
            load_preset,
            save_preset,
            missing_media,
            prepare_proxy,
            get_export_folder,
            new_project,
            open_project,
            save_project,
            get_tools,
            import_media,
            export_project,
            cancel_export,
            download_youtube,
            get_automatic_tools,
            reveal_automatic_output
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Editor");
}
