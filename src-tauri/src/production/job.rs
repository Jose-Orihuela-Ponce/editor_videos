use crate::export::ExportState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::Manager;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobRequest {
    pub job_id: String,
    pub action: String,
    pub orientation: crate::model::Orientation,
    pub url: String,
    pub quality: String,
    pub style: String,
    pub name: String,
    pub folder: Option<String>,
    pub hardware: bool,
}

pub struct AutomationJob {
    pub request: Option<JobRequest>,
    root: PathBuf,
    _lock: Option<File>,
    finished: AtomicBool,
    writing: Mutex<()>,
}

impl AutomationJob {
    pub fn from_args() -> Result<Self, String> {
        let mut args = std::env::args_os().skip(1);
        let mut path = None;
        while let Some(arg) = args.next() {
            if arg == "--automatic-job" {
                if path.is_some() {
                    return Err("Solo se admite un trabajo por proceso.".into());
                }
                path = Some(PathBuf::from(
                    args.next().ok_or("Falta el archivo del trabajo.")?,
                ));
            }
        }
        let mut job = Self {
            request: None,
            root: PathBuf::new(),
            _lock: None,
            finished: AtomicBool::new(false),
            writing: Mutex::new(()),
        };
        let Some(path) = path else {
            return Ok(job);
        };
        if !path.is_absolute() {
            return Err("La ruta del trabajo debe ser absoluta.".into());
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        if bytes.len() > 64_000 {
            return Err("El archivo del trabajo es demasiado grande.".into());
        }
        let request: JobRequest =
            serde_json::from_slice(&bytes).map_err(|e| format!("Trabajo no válido: {e}"))?;
        uuid::Uuid::parse_str(&request.job_id)
            .map_err(|_| "Identificador de trabajo no válido.")?;
        if !["process", "styles"].contains(&request.action.as_str()) {
            return Err("Acción de trabajo no válida.".into());
        }
        if request.action == "process" {
            if !["1080", "720"].contains(&request.quality.as_str()) {
                return Err("Elige descarga en 720p o 1080p.".into());
            }
            if request.style.trim().is_empty() {
                return Err("Selecciona el estilo por nombre o identificador.".into());
            }
        }
        job.root = path
            .parent()
            .ok_or("Falta la carpeta del trabajo.")?
            .to_path_buf();
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(job.root.join("job.lock"))
            .map_err(|e| e.to_string())?;
        lock.try_lock()
            .map_err(|_| "Este trabajo ya está en ejecución.")?;
        if job.root.join("result.json").exists() {
            return Err("Este trabajo ya terminó. Inicia uno nuevo.".into());
        }
        job._lock = Some(lock);
        job.request = Some(request);
        job.progress("Iniciando motor de edición", 0.0)?;
        Ok(job)
    }

    pub fn webview_directory(&self) -> PathBuf {
        self.root.join("WebView")
    }

    fn write(&self, name: &str, value: &Value) -> Result<(), String> {
        let path = self.root.join(name);
        let tmp = path.with_extension("tmp");
        let mut file = File::create(&tmp).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        if path.exists() {
            crate::repository::replace_file(&tmp, &path, None)
        } else {
            fs::rename(&tmp, &path).map_err(|e| e.to_string())
        }
    }

    pub fn cancelled(&self) -> bool {
        self.root.join("cancel").exists()
    }

    pub fn progress(&self, stage: &str, percent: f64) -> Result<(), String> {
        let _guard = self.writing.lock().map_err(|e| e.to_string())?;
        if self.request.is_none() || self.finished.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.write(
            "status.json",
            &serde_json::json!({
                "jobId": self.request.as_ref().unwrap().job_id,
                "stage": stage, "percent": percent, "state": "running",
            }),
        )
    }

    pub fn finish(&self, outcome: Value) -> Result<i32, String> {
        let _guard = self.writing.lock().map_err(|e| e.to_string())?;
        if self.request.is_none() {
            return Err("Esta ventana no ejecuta un trabajo por comando.".into());
        }
        let state = outcome
            .get("state")
            .and_then(Value::as_str)
            .ok_or("Falta el estado final.")?;
        let code = match state {
            "completed" => 0,
            "cancelled" => 2,
            "failed" => 1,
            _ => return Err("Estado final no válido.".into()),
        };
        let mut result = outcome.as_object().ok_or("Resultado no válido.")?.clone();
        result.insert(
            "jobId".into(),
            self.request.as_ref().unwrap().job_id.clone().into(),
        );
        self.write("result.json", &Value::Object(result.clone()))?;
        self.finished.store(true, Ordering::SeqCst);
        let _ = self.write("status.json", &Value::Object(result));
        Ok(code)
    }

    pub fn monitor(app: tauri::AppHandle) {
        std::thread::spawn(move || loop {
            let job = app.state::<AutomationJob>();
            if job.finished.load(Ordering::SeqCst) {
                break;
            }
            if job.cancelled() {
                if let Some(request) = &job.request {
                    let _ = app.state::<ExportState>().cancel(&request.job_id);
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        });
    }
}
