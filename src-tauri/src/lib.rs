mod production;
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
fn load_presets(
    orientation: Orientation,
    repo: tauri::State<'_, Repository>,
) -> Result<Vec<presets::NamedPreset>, String> {
    presets::load(&repo, orientation)
}
#[tauri::command]
fn save_named_preset(
    orientation: Orientation,
    preset: presets::Preset,
    name: Option<String>,
    replace_id: Option<String>,
    repo: tauri::State<'_, Repository>,
) -> Result<Vec<presets::NamedPreset>, String> {
    presets::save(&repo, orientation, preset, name, replace_id)
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
    if production::write_locations(&paths).expect("No se pudieron consultar las carpetas") { return; }
    let job = production::AutomationJob::from_args().expect("No se pudo leer el trabajo automático");
    let automated = job.request.is_some();
    let webview_directory = if automated { job.webview_directory() } else { paths.data.join("WebView") };
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Repository::new(paths.data.clone()))
        .manage(paths)
        .manage(job)
        .manage(export::ExportState::default())
        .setup(move |app| {
            std::fs::create_dir_all(&webview_directory)?;
            let mut window = tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .data_directory(webview_directory);
            if automated {
                window = window.visible(false);
                production::AutomationJob::monitor(app.handle().clone());
            }
            window.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            production::automatic_job_request,
            production::automatic_job_cancelled,
            production::automatic_job_progress,
            production::automatic_job_finish,
            get_library,
            load_presets,
            save_named_preset,
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
            production::download_youtube,
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Editor");
}
