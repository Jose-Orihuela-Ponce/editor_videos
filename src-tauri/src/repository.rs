use crate::model::{Orientation, Project};
use chrono::Utc;
use serde::Serialize;
use std::collections::HashSet;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub struct Repository {
    pub root: PathBuf,
    opened: Mutex<HashSet<PathBuf>>,
    write_lock: Mutex<()>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub project: Project,
    pub file_path: String,
    pub recovered: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub id: String,
    pub name: String,
    pub orientation: Orientation,
    pub updated_at: String,
    pub file_path: String,
    pub recovered: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub base_dir: String,
    pub projects: Vec<RecentProject>,
    pub warnings: Vec<String>,
}

impl Repository {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            opened: Mutex::new(HashSet::new()),
            write_lock: Mutex::new(()),
        }
    }

    fn ensure_dirs(&self) -> Result<(), String> {
        for name in ["Proyectos", "Preajustes"] {
            fs::create_dir_all(self.root.join(name))
                .map_err(|e| format!("No se pudo preparar la carpeta de proyectos: {e}"))?;
        }
        Ok(())
    }

    pub fn library(&self) -> Result<Library, String> {
        self.ensure_dirs()?;
        let mut projects = vec![];
        let mut warnings = vec![];
        for entry in fs::read_dir(self.root.join("Proyectos")).map_err(|e| e.to_string())? {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    warnings.push(e.to_string());
                    continue;
                }
            };
            // Ignore symlinks/reparse-point folders: only our immediate project folders are listed.
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            let path = entry.path().join("proyecto.json");
            if !path.exists() && !path.with_extension("json.bak").exists() {
                continue;
            }
            match read_project(&path) {
                Ok((project, recovered)) => projects.push(RecentProject {
                    id: project.id,
                    name: project.name,
                    orientation: project.orientation,
                    updated_at: project.updated_at,
                    file_path: path.to_string_lossy().into(),
                    recovered,
                }),
                Err(_) => warnings.push(format!(
                    "No se pudo leer {}. El archivo se conserva.",
                    entry.file_name().to_string_lossy()
                )),
            }
        }
        projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(Library {
            base_dir: self.root.to_string_lossy().into(),
            projects,
            warnings,
        })
    }

    pub fn open(&self, path: &Path) -> Result<Document, String> {
        let path = canonical_project_path(path)?;
        let (project, recovered) = read_project(&path)?;
        self.opened
            .lock()
            .map_err(|_| "No se pudo abrir el proyecto.")?
            .insert(path.clone());
        Ok(Document {
            project,
            file_path: path.to_string_lossy().into(),
            recovered,
        })
    }

    pub fn save(&self, mut project: Project, existing: Option<&Path>) -> Result<Document, String> {
        project.name = project.name.trim().to_string();
        project.validate()?;
        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "Hay otro guardado en curso.")?;
        self.ensure_dirs()?;
        let path = match existing {
            Some(path) => {
                let path = canonical_project_path(path)?;
                if !self
                    .opened
                    .lock()
                    .map_err(|_| "No se pudo comprobar la ruta.")?
                    .contains(&path)
                {
                    return Err("Abre el proyecto antes de guardarlo en esa carpeta.".into());
                }
                let (disk_project, _) = read_project(&path)?;
                if disk_project.id != project.id {
                    return Err(
                        "El proyecto de esa carpeta cambió. Ábrelo de nuevo antes de guardar."
                            .into(),
                    );
                }
                path
            }
            None => {
                let safe_name: String = project
                    .name
                    .chars()
                    .map(|c| {
                        if c.is_alphanumeric() || c == ' ' || c == '-' {
                            c
                        } else {
                            '_'
                        }
                    })
                    .take(45)
                    .collect();
                let folder = self.root.join("Proyectos").join(format!(
                    "{} {}-{}",
                    Utc::now().format("%Y-%m-%d"),
                    safe_name.trim(),
                    &project.id[..8]
                ));
                fs::create_dir(&folder)
                    .map_err(|e| format!("No se pudo crear la carpeta del proyecto: {e}"))?;
                fs::create_dir(folder.join("cache")).map_err(|e| e.to_string())?;
                folder
                    .canonicalize()
                    .map_err(|e| e.to_string())?
                    .join("proyecto.json")
            }
        };
        project.updated_at = Utc::now().to_rfc3339();
        let bytes = serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("json.tmp");
        let backup = path.with_extension("json.bak");
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)
            .map_err(|e| format!("No se pudo escribir el proyecto: {e}"))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| format!("No se completó el guardado: {e}"))?;
        drop(file);
        if path.exists() {
            // Never replace a valid recovery copy with a corrupted primary file.
            let primary_valid = read_valid(&path).is_ok();
            replace_file(&tmp, &path, primary_valid.then_some(backup.as_path()))?;
        } else {
            fs::rename(&tmp, &path)
                .map_err(|e| format!("No se pudo finalizar el guardado: {e}"))?;
        }
        self.opened
            .lock()
            .map_err(|_| "No se pudo registrar el proyecto.")?
            .insert(path.clone());
        Ok(Document {
            project,
            file_path: path.to_string_lossy().into(),
            recovered: false,
        })
    }
}

fn canonical_project_path(path: &Path) -> Result<PathBuf, String> {
    if path.file_name().and_then(|s| s.to_str()) != Some("proyecto.json") {
        return Err("Selecciona el archivo proyecto.json de la carpeta del proyecto.".into());
    }
    let parent = path
        .parent()
        .ok_or("La carpeta del proyecto no es válida.")?
        .canonicalize()
        .map_err(|_| "No se encontró la carpeta del proyecto.")?;
    let path = parent.join("proyecto.json");
    if path.is_symlink() {
        return Err("No se admite guardar proyectos a través de un enlace.".into());
    }
    Ok(path)
}

fn read_valid(path: &Path) -> Result<Project, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > 25 * 1024 * 1024 {
        return Err("El archivo de proyecto es demasiado grande.".into());
    }
    let project: Project = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|_| "El JSON del proyecto no es válido.")?;
    project.validate()?;
    Ok(project)
}

fn read_project(path: &Path) -> Result<(Project, bool), String> {
    match read_valid(path) {
        Ok(project) => Ok((project, false)),
        Err(primary_error) => {
            // A future schema must not silently fall back to an older backup.
            if let Ok(value) = fs::read(path).and_then(|bytes| {
                serde_json::from_slice::<serde_json::Value>(&bytes).map_err(std::io::Error::other)
            }) {
                if value
                    .get("version")
                    .and_then(|v| v.as_u64())
                    .is_some_and(|v| v != 1)
                {
                    return Err(
                        "Versión de proyecto no compatible. No se ha modificado el archivo.".into(),
                    );
                }
            }
            read_valid(&path.with_extension("json.bak"))
                .map(|p| (p, true))
                .map_err(|_| format!("No se pudo abrir el proyecto: {primary_error}"))
        }
    }
}

#[cfg(windows)]
pub(crate) fn replace_file(
    source: &Path,
    target: &Path,
    backup: Option<&Path>,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{ReplaceFileW, REPLACEFILE_IGNORE_MERGE_ERRORS};
    if let Some(backup) = backup {
        if backup.exists() {
            fs::remove_file(backup).map_err(|e| e.to_string())?;
        }
    }
    let wide = |path: &Path| {
        path.as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>()
    };
    let source = wide(source);
    let target = wide(target);
    let backup = backup.map(wide);
    let result = unsafe {
        ReplaceFileW(
            target.as_ptr(),
            source.as_ptr(),
            backup.as_ref().map_or(std::ptr::null(), |v| v.as_ptr()),
            REPLACEFILE_IGNORE_MERGE_ERRORS,
            std::ptr::null(),
            std::ptr::null(),
        )
    };
    if result == 0 {
        Err(format!(
            "No se pudo reemplazar el proyecto; el temporal se conserva: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
pub(crate) fn replace_file(
    source: &Path,
    target: &Path,
    backup: Option<&Path>,
) -> Result<(), String> {
    if let Some(backup) = backup {
        fs::copy(target, backup).map_err(|e| e.to_string())?;
    }
    fs::rename(source, target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Clip, Crop, Media};
    struct TestFolder(PathBuf);
    impl TestFolder {
        fn new() -> Self {
            Self(
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .unwrap()
                    .join(".local/rust-tests")
                    .join(uuid::Uuid::new_v4().to_string()),
            )
        }
    }
    impl Drop for TestFolder {
        fn drop(&mut self) {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join(".local/rust-tests");
            if let (Ok(path), Ok(root)) = (self.0.canonicalize(), root.canonicalize()) {
                if path.starts_with(&root) && path != root {
                    let _ = fs::remove_dir_all(path);
                }
            }
        }
    }

    #[test]
    fn save_reopen_and_backup_preserve_project() {
        let folder = TestFolder::new();
        let repo = Repository::new(folder.0.clone());
        let project = Project::new("Mi película".into(), Orientation::Vertical);
        let first = repo.save(project, None).unwrap();
        let file_path = Path::new(&first.file_path);
        assert_eq!(repo.open(file_path).unwrap().project, first.project);
        let mut changed = first.project.clone();
        changed.name = "Otro nombre".into();
        let second = repo.save(changed, Some(file_path)).unwrap();
        assert_eq!(
            read_valid(&file_path.with_extension("json.bak")).unwrap(),
            first.project
        );
        assert_eq!(repo.open(file_path).unwrap().project, second.project);
        // A third replacement must rotate the backup on Windows too.
        repo.save(second.project.clone(), Some(file_path)).unwrap();
        assert_eq!(
            read_valid(&file_path.with_extension("json.bak")).unwrap(),
            second.project
        );
        let other_session = Repository::new(folder.0.clone());
        assert_eq!(other_session.library().unwrap().projects.len(), 1);
        assert_eq!(
            other_session.open(file_path).unwrap().project.name,
            "Otro nombre"
        );
    }

    #[test]
    fn transformed_clips_round_trip_through_disk_and_backup() {
        let folder = TestFolder::new();
        let repo = Repository::new(folder.0.clone());
        for orientation in [Orientation::Horizontal, Orientation::Vertical] {
            let mut project = Project::new("Transformaciones".into(), orientation);
            project.media.push(Media {
                id: "media".into(),
                kind: "video".into(),
                path: "C:/original.mp4".into(),
                rel_path: None,
                duration: 8.0,
                w: Some(1920),
                h: Some(1080),
                fps: Some(30.0),
                has_audio: true,
                thumbnail: None,
            });
            project.main.push(Clip {
                id: "clip".into(),
                media_id: "media".into(),
                start: 0.0,
                src_start: 1.0,
                src_end: 7.0,
                speed: 2.0,
                volume: 1.75,
                flip_h: true,
                flip_v: true,
                zoom: 1.5,
                stretch_x: 0.8,
                stretch_y: 1.2,
                pos_x: 120.0,
                pos_y: -85.0,
                crop: Crop {
                    x: 0.1,
                    y: 0.2,
                    w: 0.8,
                    h: 0.6,
                },
            });
            let first = repo.save(project, None).unwrap();
            let path = Path::new(&first.file_path);
            let new_session = Repository::new(folder.0.clone());
            assert_eq!(new_session.open(path).unwrap().project, first.project);
            let mut changed = first.project.clone();
            changed.main[0].speed = 0.25;
            changed.main[0].volume = 0.0;
            let second = new_session.save(changed, Some(path)).unwrap();
            assert_eq!(new_session.open(path).unwrap().project, second.project);
            assert_eq!(
                read_valid(&path.with_extension("json.bak")).unwrap(),
                first.project
            );
            let mut invalid = second.project;
            invalid.main[0].zoom = 20.0;
            assert!(new_session.save(invalid, Some(path)).is_err());
            assert_eq!(new_session.open(path).unwrap().project.main[0].speed, 0.25);
        }
    }

    #[test]
    fn layered_project_round_trips_all_tracks_and_styles() {
        let folder = TestFolder::new();
        let repo = Repository::new(folder.0.clone());
        let mut project = Project::new("Varias capas".into(), Orientation::Horizontal);
        project.media = serde_json::from_value(serde_json::json!([
            {"id":"video","kind":"video","path":"C:/video.mp4","duration":8,"w":640,"h":360,"fps":24,"hasAudio":true},
            {"id":"image","kind":"image","path":"C:/image.png","duration":0,"w":200,"h":100,"hasAudio":false},
            {"id":"audio","kind":"audio","path":"C:/audio.wav","duration":12,"hasAudio":true}
        ])).unwrap();
        project.overlays = serde_json::from_value(serde_json::json!([
            {"id":"title","type":"text","start":1,"duration":3,"posX":100,"posY":-50,"scale":1.2,"track":2,"text":"Hola","style":{"font":"Montserrat","size":72,"color":"#ffffff","bgColor":"#112233","bgOpacity":0.6,"bgEnabled":false,"bold":true,"italic":true,"underline":true,"opacity":0.55,"align":"center"}},
            {"id":"photo","type":"image","mediaId":"image","start":1,"duration":5,"posX":-80,"posY":30,"scale":0.5,"track":1},
            {"id":"overlay","type":"video","mediaId":"video","start":1,"duration":2,"srcStart":1,"srcEnd":5,"speed":2,"volume":1.5,"posX":40,"posY":10,"scale":0.6,"track":3}
        ])).unwrap();
        project.audio = serde_json::from_value(serde_json::json!([
            {"id":"music1","mediaId":"audio","start":0,"srcStart":0,"srcEnd":12,"speed":1,"volume":0.7,"track":0},
            {"id":"music2","mediaId":"audio","start":1,"srcStart":2,"srcEnd":8,"speed":0.5,"volume":1.8,"track":1}
        ])).unwrap();
        let first = repo.save(project, None).unwrap();
        let path = Path::new(&first.file_path);
        let new_session = Repository::new(folder.0.clone());
        assert_eq!(new_session.open(path).unwrap().project, first.project);
        let mut changed = first.project.clone();
        changed.overlays[0].pos_x = 230.0;
        changed.audio[1].volume = 0.2;
        let second = new_session.save(changed, Some(path)).unwrap();
        assert_eq!(new_session.open(path).unwrap().project, second.project);
        assert_eq!(
            read_valid(&path.with_extension("json.bak")).unwrap(),
            first.project
        );
        let mut invalid = second.project.clone();
        invalid.overlays[2].duration = 3.0;
        assert!(new_session.save(invalid, Some(path)).is_err());
        assert_eq!(new_session.open(path).unwrap().project, second.project);
    }

    #[test]
    fn corrupted_primary_recovers_without_destroying_good_backup() {
        let folder = TestFolder::new();
        let repo = Repository::new(folder.0.clone());
        let first = repo
            .save(
                Project::new("Respaldo".into(), Orientation::Horizontal),
                None,
            )
            .unwrap();
        let path = Path::new(&first.file_path);
        repo.save(first.project.clone(), Some(path)).unwrap();
        fs::write(path, b"{interrupted").unwrap();
        let recovered = repo.open(path).unwrap();
        assert!(recovered.recovered);
        repo.save(recovered.project, Some(path)).unwrap();
        assert!(!repo.open(path).unwrap().recovered);
        assert_eq!(
            read_valid(&path.with_extension("json.bak")).unwrap().name,
            "Respaldo"
        );
    }

    #[test]
    fn refuses_future_version_and_unopened_save_paths() {
        let folder = TestFolder::new();
        let repo = Repository::new(folder.0.clone());
        let saved = repo
            .save(Project::new("Actual".into(), Orientation::Horizontal), None)
            .unwrap();
        let path = Path::new(&saved.file_path);
        let other_session = Repository::new(folder.0.clone());
        assert!(other_session
            .save(saved.project.clone(), Some(path))
            .is_err());
        fs::copy(path, path.with_extension("json.bak")).unwrap();
        let mut future = saved.project;
        future.version = 2;
        fs::write(path, serde_json::to_vec(&future).unwrap()).unwrap();
        assert!(repo.open(path).unwrap_err().contains("Versión"));
    }
}
