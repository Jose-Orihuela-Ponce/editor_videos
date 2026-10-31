use crate::{media, model::Project};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct ExportState {
    active: Mutex<Option<(String, Arc<AtomicBool>)>>,
    encoders: Mutex<Option<Vec<String>>>,
}
impl ExportState {
    pub fn reserve(&self, id: &str) -> Result<Arc<AtomicBool>, String> {
        uuid::Uuid::parse_str(id).map_err(|_| "Identificador de exportación no válido.")?;
        let mut active = self
            .active
            .lock()
            .map_err(|_| "No se pudo iniciar la exportación.")?;
        if active.is_some() {
            return Err("Ya hay una exportación en curso.".into());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some((id.into(), cancel.clone()));
        Ok(cancel)
    }
    pub fn cancel(&self, id: &str) -> Result<(), String> {
        let active = self.active.lock().map_err(|_| "No se pudo cancelar.")?;
        if let Some((current, flag)) = active.as_ref() {
            if current == id {
                flag.store(true, Ordering::SeqCst);
            }
        }
        Ok(())
    }
    pub fn finish(&self) {
        if let Ok(mut active) = self.active.lock() {
            *active = None;
        }
    }
    pub fn known_encoders(&self) -> Option<Vec<String>> {
        self.encoders.lock().ok()?.clone()
    }
    pub fn remember_encoders(&self, values: Vec<String>) {
        if let Ok(mut cache) = self.encoders.lock() {
            *cache = Some(values);
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderPlan {
    pub media_ids: Vec<String>,
    #[serde(default)]
    pub text_images: Vec<TextImage>,
    pub graph: String,
    pub video_label: Option<String>,
    pub audio_label: String,
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
}
#[derive(Clone, Deserialize)]
pub struct TextImage {
    pub id: String,
    pub data: String,
}
#[derive(Clone, Deserialize)]
pub struct ExportOptions {
    pub format: String,
    pub quality: String,
    pub hardware: bool,
    pub name: String,
    pub folder: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub job_id: String,
    pub percent: f64,
    pub stage: String,
    pub encoder: String,
}
#[derive(Serialize)]
pub struct ExportResult {
    pub cancelled: bool,
    pub path: Option<String>,
    pub encoder: String,
}

pub fn supported_encoders(ffmpeg: &Path, cancel: &AtomicBool) -> Vec<String> {
    let mut result = vec![];
    for name in ["h264_nvenc", "h264_qsv", "h264_amf"] {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let child = media::command(ffmpeg)
            .args([
                "-v",
                "error",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=128x128:r=30",
                "-frames:v",
                "1",
                "-an",
                "-c:v",
                name,
                "-f",
                "null",
                "-",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
        if let Ok(mut child) = child {
            let started = Instant::now();
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        if status.success() {
                            result.push(name.to_string());
                        }
                        break;
                    }
                    _ if started.elapsed() > Duration::from_secs(4)
                        || cancel.load(Ordering::SeqCst) =>
                    {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                    Ok(None) => std::thread::sleep(Duration::from_millis(40)),
                    Err(_) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                }
            }
        }
    }
    result
}

fn validate(project: &Project, plan: &RenderPlan, options: &ExportOptions) -> Result<(), String> {
    project.validate()?;
    if !["mp4", "mp3"].contains(&options.format.as_str())
        || !["original", "1080", "720", "480"].contains(&options.quality.as_str())
    {
        return Err("Formato o calidad no válidos.".into());
    }
    let name = options.name.trim();
    if name.is_empty()
        || name.len() > 180
        || name.ends_with('.')
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("Elige un nombre de exportación sin caracteres especiales de Windows.".into());
    }
    let base = name.split('.').next().unwrap_or("").to_uppercase();
    if [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .contains(&base.as_str())
    {
        return Err("Ese nombre está reservado por Windows. Elige otro.".into());
    }
    let main_duration = project
        .main
        .iter()
        .map(|c| c.start + (c.src_end - c.src_start) / c.speed)
        .fold(0.0_f64, f64::max);
    let expected_duration = if project.main.is_empty() {
        project
            .overlays
            .iter()
            .map(|o| o.start + o.duration)
            .chain(
                project
                    .audio
                    .iter()
                    .map(|a| a.start + (a.src_end - a.src_start) / a.speed),
            )
            .fold(0.0_f64, f64::max)
    } else {
        main_duration
    };
    if !plan.duration.is_finite()
        || plan.duration <= 0.0
        || (expected_duration - plan.duration).abs() > 1e-6
        || !plan.fps.is_finite()
        || plan.fps <= 0.0
        || plan.fps > 60.0
        || plan.width < 2
        || plan.height < 2
        || plan.width % 2 != 0
        || plan.height % 2 != 0
        || plan.graph.len() > 2_000_000
        || plan.graph.is_empty()
    {
        return Err("El plan de exportación no es válido.".into());
    }
    if plan.audio_label != "aout"
        || (options.format == "mp4" && plan.video_label.as_deref() != Some("vout"))
        || (options.format == "mp3" && plan.video_label.is_some())
    {
        return Err("Las pistas de exportación no son válidas.".into());
    }
    for id in &plan.media_ids {
        if !project.media.iter().any(|m| &m.id == id)
            || !(project.main.iter().any(|c| &c.media_id == id)
                || project
                    .overlays
                    .iter()
                    .any(|o| o.media_id.as_ref() == Some(id) && o.start < expected_duration)
                || project
                    .audio
                    .iter()
                    .any(|a| &a.media_id == id && a.start < expected_duration))
        {
            return Err("Un original de exportación no pertenece al proyecto.".into());
        }
    }
    let expected_texts: Vec<_> = if options.format == "mp4" {
        project
            .overlays
            .iter()
            .filter(|o| o.kind == "text" && o.start < expected_duration)
            .collect()
    } else {
        Vec::new()
    };
    if plan.text_images.len() != expected_texts.len()
        || plan.text_images.iter().any(|image| {
            !expected_texts.iter().any(|o| o.id == image.id)
                || !image.data.starts_with("data:image/png;base64,")
        })
    {
        return Err("Las imágenes de texto de la exportación no son válidas.".into());
    }
    let mut text_ids = std::collections::HashSet::new();
    if plan
        .text_images
        .iter()
        .any(|image| !text_ids.insert(&image.id))
    {
        return Err("Un texto de exportación está repetido.".into());
    }
    if project
        .main
        .iter()
        .any(|c| !plan.media_ids.contains(&c.media_id))
    {
        return Err("Faltan originales en la exportación.".into());
    }
    Ok(())
}

struct OwnedFiles {
    graph: PathBuf,
    partial: PathBuf,
    texts: Vec<PathBuf>,
}

pub fn default_folder() -> Result<PathBuf, String> {
    dirs::video_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Videos")))
        .map(|videos| videos.join("ediciones"))
        .ok_or_else(|| {
            "No se pudo localizar la carpeta Videos. Elige una carpeta de exportación.".into()
        })
}
impl Drop for OwnedFiles {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.graph);
        let _ = fs::remove_file(&self.partial);
        for text in &self.texts {
            let _ = fs::remove_file(text);
        }
    }
}

pub fn render(
    root: &Path,
    ffmpeg: &Path,
    project: &Project,
    plan: &RenderPlan,
    options: &ExportOptions,
    id: &str,
    cancel: Arc<AtomicBool>,
    encoders: &[String],
    report: Arc<dyn Fn(Progress) + Send + Sync>,
) -> Result<ExportResult, String> {
    validate(project, plan, options)?;
    uuid::Uuid::parse_str(id).map_err(|_| "Identificador de exportación no válido.")?;
    let folder = match &options.folder {
        Some(folder) => PathBuf::from(folder),
        None => default_folder()?,
    };
    fs::create_dir_all(&folder)
        .map_err(|e| format!("No se pudo abrir la carpeta de salida: {e}"))?;
    let folder = folder.canonicalize().map_err(|e| e.to_string())?;
    let name = options.name.trim();
    let mut output = folder.join(format!("{name}.{}", options.format));
    let mut suffix = 2;
    while output.exists() {
        output = folder.join(format!("{name} ({suffix}).{}", options.format));
        suffix += 1;
    }
    let work = root.join("cache/exports");
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let mut files = OwnedFiles {
        graph: work.join(format!("{id}.txt")),
        partial: folder.join(format!(".{id}.partial.{}", options.format)),
        texts: Vec::new(),
    };
    for (index, image) in plan.text_images.iter().enumerate() {
        let data = image
            .data
            .strip_prefix("data:image/png;base64,")
            .ok_or("Imagen de texto no válida.")?;
        let bytes = BASE64
            .decode(data)
            .map_err(|_| "No se pudo decodificar el texto.")?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("La imagen de texto no es un PNG válido.".into());
        }
        let path = work.join(format!("{id}-text-{index}.png"));
        files.texts.push(path.clone());
        fs::write(path, bytes).map_err(|e| format!("No se pudo preparar el texto: {e}"))?;
    }
    fs::write(&files.graph, &plan.graph)
        .map_err(|e| format!("No se pudo preparar la exportación: {e}"))?;
    let mut encoder = if options.format == "mp3" {
        "libmp3lame".to_string()
    } else if options.hardware {
        encoders
            .first()
            .cloned()
            .unwrap_or_else(|| "libx264".into())
    } else {
        "libx264".into()
    };
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Ok(ExportResult {
                cancelled: true,
                path: None,
                encoder,
            });
        }
        report(Progress {
            job_id: id.into(),
            percent: 0.0,
            stage: "Exportando".into(),
            encoder: encoder.clone(),
        });
        let mut command = media::command(ffmpeg);
        command.args([
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-progress",
            "pipe:1",
            "-nostats",
        ]);
        for media_id in &plan.media_ids {
            let item = project
                .media
                .iter()
                .find(|m| &m.id == media_id)
                .ok_or("No se encontró un original.")?;
            let path = media::local_path(Path::new(&item.path))?;
            command
                .args(["-protocol_whitelist", "file,pipe,crypto,data", "-i"])
                .arg(path);
        }
        for path in &files.texts {
            command
                .args(["-protocol_whitelist", "file,pipe,crypto,data", "-i"])
                .arg(path);
        }
        command.arg("-/filter_complex").arg(&files.graph);
        if let Some(label) = &plan.video_label {
            command.args(["-map", &format!("[{label}]"), "-c:v", &encoder]);
        }
        command.args(["-map", &format!("[{}]", plan.audio_label)]);
        if options.format == "mp3" {
            command.args(["-vn", "-c:a", "libmp3lame", "-q:a", "2"]);
        } else {
            match encoder.as_str() {
                "h264_nvenc" => {
                    command.args(["-preset", "p4", "-rc", "vbr", "-cq", "20", "-b:v", "0"]);
                }
                "h264_qsv" => {
                    command.args(["-preset", "veryfast", "-global_quality", "20"]);
                }
                "h264_amf" => {
                    command.args([
                        "-quality", "speed", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20",
                    ]);
                }
                _ => {
                    command.args(["-preset", "veryfast", "-crf", "20"]);
                }
            }
            command.args([
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
            ]);
        }
        command
            .args(["-t", &format!("{:.9}", plan.duration)])
            .arg(&files.partial)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|e| format!("No se pudo iniciar FFmpeg: {e}"))?;
        let stdout = child.stdout.take().ok_or("No se pudo leer el progreso.")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("No se pudo leer el registro de exportación.")?;
        let logs = Arc::new(Mutex::new(VecDeque::<String>::new()));
        let log_target = logs.clone();
        let log_reader = std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Ok(mut logs) = log_target.lock() {
                    if logs.len() == 60 {
                        logs.pop_front();
                    }
                    logs.push_back(line);
                }
            }
        });
        let progress_report = report.clone();
        let progress_id = id.to_string();
        let progress_encoder = encoder.clone();
        let duration = plan.duration;
        let progress_reader = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some(time) = line
                    .strip_prefix("out_time_us=")
                    .and_then(|s| s.parse::<f64>().ok())
                {
                    progress_report(Progress {
                        job_id: progress_id.clone(),
                        percent: (time / 1_000_000.0 / duration * 100.0).clamp(0.0, 99.5),
                        stage: "Exportando".into(),
                        encoder: progress_encoder.clone(),
                    });
                }
            }
        });
        let status = loop {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill();
            }
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(error.to_string());
                }
            }
        };
        let _ = progress_reader.join();
        let _ = log_reader.join();
        if cancel.load(Ordering::SeqCst) {
            return Ok(ExportResult {
                cancelled: true,
                path: None,
                encoder,
            });
        }
        if status.success() {
            // Windows rename refuses to overwrite an existing file, including a racing export.
            fs::rename(&files.partial, &output).map_err(|e| {
                format!("La exportación terminó, pero no se pudo publicar el archivo: {e}")
            })?;
            report(Progress {
                job_id: id.into(),
                percent: 100.0,
                stage: "Terminado".into(),
                encoder: encoder.clone(),
            });
            return Ok(ExportResult {
                cancelled: false,
                path: Some(dunce::simplified(&output).to_string_lossy().into()),
                encoder,
            });
        }
        let error = logs
            .lock()
            .map(|s| s.iter().cloned().collect::<Vec<_>>().join("\n"))
            .unwrap_or_default();
        let lower = error.to_lowercase();
        let encoder_failure = lower.contains(&encoder)
            || [
                "no capable devices",
                "cannot load",
                "error while opening encoder",
            ]
            .iter()
            .any(|s| lower.contains(s));
        if options.format == "mp4" && encoder != "libx264" && encoder_failure {
            encoder = "libx264".into();
            report(Progress {
                job_id: id.into(),
                percent: 0.0,
                stage: "Reintentando por CPU".into(),
                encoder: encoder.clone(),
            });
        } else {
            return Err(format!(
                "No se pudo exportar.\n{}",
                if error.is_empty() {
                    "FFmpeg terminó sin generar una salida válida."
                } else {
                    &error
                }
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join(".local/native-export-tests");
            if let (Ok(path), Ok(root)) = (self.0.canonicalize(), root.canonicalize()) {
                if path.starts_with(&root) && path != root {
                    let _ = fs::remove_dir_all(path);
                }
            }
        }
    }
    fn fixture() -> (Fixture, PathBuf, Project, RenderPlan, ExportOptions) {
        let folder = Fixture(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join(".local/native-export-tests")
                .join(uuid::Uuid::new_v4().to_string()),
        );
        fs::create_dir_all(&folder.0).unwrap();
        let ffmpeg = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/ffmpeg-x86_64-pc-windows-msvc.exe");
        let input = folder.0.join("original.mp4");
        let status = media::command(&ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=16x16:r=1:d=180",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&input)
            .output()
            .unwrap();
        assert!(
            status.status.success(),
            "{}",
            String::from_utf8_lossy(&status.stderr)
        );
        let mut project = Project::new("Exportación".into(), crate::model::Orientation::Horizontal);
        project.media.push(crate::model::Media {
            id: "input".into(),
            kind: "video".into(),
            path: input.to_string_lossy().into(),
            duration: 180.0,
            w: Some(16),
            h: Some(16),
            fps: Some(1.0),
            has_audio: false,
            rel_path: None,
            thumbnail: None,
        });
        project.main.push(serde_json::from_value(serde_json::json!({"id":"clip", "mediaId":"input", "start":0, "srcStart":0, "srcEnd":1, "speed":1, "volume":1, "flipH":false, "flipV":false, "zoom":1, "stretchX":1, "stretchY":1, "posX":0, "posY":0, "crop":{"x":0,"y":0,"w":1,"h":1}})).unwrap());
        let plan = RenderPlan { media_ids: vec!["input".into()], text_images: vec![], graph: "color=c=red:s=320x180:r=30:d=1[vout];anullsrc=r=48000:cl=stereo,atrim=duration=1[aout]".into(), video_label: Some("vout".into()), audio_label: "aout".into(), duration: 1.0, width: 320, height: 180, fps: 30.0 };
        let options = ExportOptions {
            format: "mp4".into(),
            quality: "480".into(),
            hardware: true,
            name: "Salida".into(),
            folder: Some(folder.0.join("Exportados").to_string_lossy().into()),
        };
        (folder, ffmpeg, project, plan, options)
    }

    #[test]
    fn process_falls_back_to_cpu_without_overwriting_an_existing_file() {
        let (folder, ffmpeg, project, plan, options) = fixture();
        let output_dir = folder.0.join("Exportados");
        fs::create_dir_all(&output_dir).unwrap();
        let existing = output_dir.join("Salida.mp4");
        fs::write(&existing, b"archivo anterior").unwrap();
        let events = Arc::new(Mutex::new(Vec::<Progress>::new()));
        let target = events.clone();
        let result = render(
            &folder.0,
            &ffmpeg,
            &project,
            &plan,
            &options,
            &uuid::Uuid::new_v4().to_string(),
            Arc::new(AtomicBool::new(false)),
            &["encoder_missing_for_test".into()],
            Arc::new(move |progress| target.lock().unwrap().push(progress)),
        )
        .unwrap();
        assert!(!result.cancelled);
        assert_eq!(result.encoder, "libx264");
        assert!(result.path.unwrap().ends_with("Salida (2).mp4"));
        assert_eq!(fs::read(existing).unwrap(), b"archivo anterior");
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|p| p.stage == "Reintentando por CPU"));
        assert_eq!(events.lock().unwrap().last().unwrap().percent, 100.0);
    }

    #[test]
    fn cancelling_a_real_process_removes_its_partial_output() {
        let (folder, ffmpeg, mut project, mut plan, mut options) = fixture();
        project.main[0].src_end = 180.0;
        plan.duration = 180.0;
        plan.width = 1920;
        plan.height = 1080;
        plan.fps = 60.0;
        plan.graph = "color=c=red:s=1920x1080:r=60:d=180[vout];anullsrc=r=48000:cl=stereo,atrim=duration=180[aout]".into();
        options.hardware = false;
        let flag = Arc::new(AtomicBool::new(false));
        let signal = flag.clone();
        let cancel = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            signal.store(true, Ordering::SeqCst);
        });
        let result = render(
            &folder.0,
            &ffmpeg,
            &project,
            &plan,
            &options,
            &uuid::Uuid::new_v4().to_string(),
            flag,
            &[],
            Arc::new(|_| {}),
        )
        .unwrap();
        cancel.join().unwrap();
        assert!(result.cancelled);
        assert!(result.path.is_none());
        assert_eq!(
            fs::read_dir(folder.0.join("Exportados")).unwrap().count(),
            0
        );
        assert_eq!(
            fs::read_dir(folder.0.join("cache/exports"))
                .unwrap()
                .count(),
            0
        );
        assert!(Path::new(&project.media[0].path).is_file());
    }
    #[test]
    fn cancellation_is_scoped_to_the_active_job() {
        let state = ExportState::default();
        let id = uuid::Uuid::new_v4().to_string();
        let flag = state.reserve(&id).unwrap();
        assert!(state.reserve(&uuid::Uuid::new_v4().to_string()).is_err());
        state.cancel("another-job").unwrap();
        assert!(!flag.load(Ordering::SeqCst));
        state.cancel(&id).unwrap();
        assert!(flag.load(Ordering::SeqCst));
        state.finish();
        assert!(state.reserve(&uuid::Uuid::new_v4().to_string()).is_ok());
    }
}
