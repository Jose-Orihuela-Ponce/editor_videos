use crate::model::{Clip, Crop, Media, Orientation, Overlay, Project, TextStyle};
use crate::repository::Repository;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipPreset {
    pub speed: f64,
    pub volume: f64,
    pub flip_h: bool,
    pub flip_v: bool,
    pub zoom: f64,
    pub stretch_x: f64,
    pub stretch_y: f64,
    pub pos_x: f64,
    pub pos_y: f64,
    pub crop: Crop,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub clip: Option<ClipPreset>,
    pub text: Option<TextStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub texts: Option<Vec<StyleText>>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StyleText {
    pub text: String,
    pub style: TextStyle,
    pub pos_x: f64,
    pub pos_y: f64,
    pub scale: f64,
    pub start: f64,
    pub duration: f64,
}
impl Preset {
    fn validate(&self, orientation: Orientation) -> Result<(), String> {
        let mut p = Project::new("Preajuste".into(), orientation);
        if let Some(c) = &self.clip {
            p.media.push(Media {
                id: "media".into(),
                kind: "video".into(),
                path: "preset".into(),
                rel_path: None,
                duration: 10.0,
                w: Some(1920),
                h: Some(1080),
                fps: None,
                has_audio: true,
                thumbnail: None,
            });
            p.main.push(Clip {
                id: "clip".into(),
                media_id: "media".into(),
                start: 0.0,
                src_start: 0.0,
                src_end: 1.0,
                speed: c.speed,
                volume: c.volume,
                flip_h: c.flip_h,
                flip_v: c.flip_v,
                zoom: c.zoom,
                stretch_x: c.stretch_x,
                stretch_y: c.stretch_y,
                pos_x: c.pos_x,
                pos_y: c.pos_y,
                crop: c.crop.clone(),
            });
        }
        if let Some(t) = &self.text {
            p.overlays.push(Overlay {
                id: "text".into(),
                kind: "text".into(),
                start: 0.0,
                duration: 1.0,
                pos_x: 0.0,
                pos_y: 0.0,
                scale: 1.0,
                track: None,
                text: Some(String::new()),
                style: Some(t.clone()),
                media_id: None,
                crop: None,
                src_start: None,
                src_end: None,
                speed: None,
                volume: None,
            });
        }
        if let Some(texts) = &self.texts {
            if texts.len() > 100 {
                return Err("El estilo contiene demasiados textos.".into());
            }
            for (i, t) in texts.iter().enumerate() {
                p.overlays.push(Overlay {
                    id: format!("saved-text-{i}"),
                    kind: "text".into(),
                    start: t.start,
                    duration: t.duration,
                    pos_x: t.pos_x,
                    pos_y: t.pos_y,
                    scale: t.scale,
                    track: None,
                    text: Some(t.text.clone()),
                    style: Some(t.style.clone()),
                    media_id: None,
                    crop: None,
                    src_start: None,
                    src_end: None,
                    speed: None,
                    volume: None,
                });
            }
        }
        p.validate()
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NamedPreset {
    id: String,
    name: String,
    preset: Preset,
}

fn legacy_path(repo: &Repository, orientation: Orientation) -> PathBuf {
    repo.root.join("Preajustes").join(match orientation {
        Orientation::Horizontal => "horizontal.json",
        Orientation::Vertical => "vertical.json",
    })
}

fn read_if_present(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("No se pudieron leer los estilos: {error}")),
    }
}

pub fn load(repo: &Repository, orientation: Orientation) -> Result<Vec<NamedPreset>, String> {
    let legacy = legacy_path(repo, orientation);
    if let Some(bytes) = read_if_present(&legacy.with_extension("styles.json"))? {
        let styles: Vec<NamedPreset> =
            serde_json::from_slice(&bytes).map_err(|_| "La lista de estilos no es válida.")?;
        for style in &styles {
            style.preset.validate(orientation)?;
        }
        return Ok(styles);
    }
    let Some(bytes) = read_if_present(&legacy)? else {
        return Ok(Vec::new());
    };
    let preset: Preset =
        serde_json::from_slice(&bytes).map_err(|_| "El estilo anterior no es válido.")?;
    preset.validate(orientation)?;
    if preset.clip.is_none()
        && preset.text.is_none()
        && preset.texts.as_ref().is_none_or(Vec::is_empty)
    {
        return Ok(Vec::new());
    }
    Ok(vec![NamedPreset {
        id: "legacy".into(),
        name: "Mi estilo".into(),
        preset,
    }])
}

pub fn save(
    repo: &Repository,
    orientation: Orientation,
    preset: Preset,
    name: Option<String>,
    replace_id: Option<String>,
) -> Result<Vec<NamedPreset>, String> {
    preset.validate(orientation)?;
    let path = legacy_path(repo, orientation).with_extension("styles.json");
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    // Lock a separate file so replacing the JSON stays atomic across app instances.
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path.with_extension("lock"))
        .map_err(|e| e.to_string())?;
    lock.lock().map_err(|e| e.to_string())?;
    let mut styles = load(repo, orientation)?;
    let entry = if let Some(id) = replace_id {
        let index = styles
            .iter()
            .position(|style| style.id == id)
            .ok_or("El estilo que quieres reemplazar ya no está disponible.")?;
        let mut entry = styles.remove(index);
        entry.preset = preset;
        entry
    } else {
        let name = name.as_deref().unwrap_or_default().trim();
        if name.is_empty() || name.chars().count() > 60 {
            return Err("Escribe un nombre de hasta 60 caracteres.".into());
        }
        if styles
            .iter()
            .any(|style| style.name.to_lowercase() == name.to_lowercase())
        {
            return Err("Ya hay un estilo con ese nombre en esta orientación.".into());
        }
        NamedPreset {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            preset,
        }
    };
    styles.insert(0, entry);
    let bytes = serde_json::to_vec_pretty(&styles).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    if path.exists() {
        crate::repository::replace_file(&tmp, &path, None)?;
    } else {
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    }
    Ok(styles)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn orientations_and_components_survive_reopen() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(".local/rust-tests");
        let dir = root.join(uuid::Uuid::new_v4().to_string());
        let repo = Repository::new(dir.clone());
        let text:TextStyle=serde_json::from_value(serde_json::json!({"font":"Montserrat","size":80,"color":"#ffffff","bold":true,"italic":true,"underline":true,"bgEnabled":false,"bgOpacity":0.5,"opacity":0.8,"letterSpacing":-12,"lineHeight":0.85,"align":"center"})).unwrap();
        let preset = Preset {
            clip: Some(
                serde_json::from_value(serde_json::json!({
                    "speed":1.04,"volume":1.35,"flipH":true,"flipV":true,
                    "zoom":1.2,"stretchX":1.1,"stretchY":0.9,"posX":42,"posY":-37,
                    "crop":{"x":0.1,"y":0.1,"w":0.8,"h":0.8}
                }))
                .unwrap(),
            ),
            text: Some(text.clone()),
            texts: Some(vec![
                StyleText {
                    text: "Primera línea\nSegunda línea: áéíóú 🎬".into(),
                    style: text.clone(),
                    pos_x: 30.0,
                    pos_y: -70.0,
                    scale: 1.2,
                    start: 0.0,
                    duration: 3.0,
                },
                StyleText {
                    text: "Otro texto completo".into(),
                    style: text,
                    pos_x: 31.0,
                    pos_y: -70.0,
                    scale: 1.2,
                    start: 1.0,
                    duration: 3.0,
                },
            ]),
        };
        let legacy = legacy_path(&repo, Orientation::Horizontal);
        fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        let original = serde_json::to_vec(&preset).unwrap();
        fs::write(&legacy, &original).unwrap();
        let reopened = Repository::new(dir.clone());
        let migrated = load(&reopened, Orientation::Horizontal).unwrap();
        assert_eq!(migrated[0].name, "Mi estilo");
        assert_eq!(migrated[0].preset, preset);
        assert!(load(&reopened, Orientation::Vertical).unwrap().is_empty());
        let mut changed = preset.clone();
        changed.text.as_mut().unwrap().size = 110.0;
        let styles = save(
            &repo,
            Orientation::Horizontal,
            changed.clone(),
            Some("Noticias".into()),
            None,
        )
        .unwrap();
        assert_eq!(styles.len(), 2);
        assert_eq!(styles[1], migrated[0]);
        assert_eq!(load(&reopened, Orientation::Horizontal).unwrap(), styles);
        assert!(save(
            &repo,
            Orientation::Horizontal,
            preset.clone(),
            Some(" noticias ".into()),
            None
        )
        .is_err());
        let id = styles[0].id.clone();
        let replaced = save(
            &reopened,
            Orientation::Horizontal,
            preset.clone(),
            None,
            Some(id.clone()),
        )
        .unwrap();
        assert_eq!(replaced[0].id, id);
        assert_eq!(replaced[0].name, "Noticias");
        assert_eq!(replaced[0].preset, preset);
        assert_eq!(replaced[1], migrated[0]);
        changed.text.as_mut().unwrap().opacity = Some(2.0);
        assert!(save(&repo, Orientation::Horizontal, changed, None, Some(id)).is_err());
        assert_eq!(load(&repo, Orientation::Horizontal).unwrap(), replaced);
        assert_eq!(fs::read(legacy).unwrap(), original);
        let actual = dir.canonicalize().unwrap();
        let test_root = root.canonicalize().unwrap();
        if actual.starts_with(&test_root) && actual != test_root {
            std::fs::remove_dir_all(actual).unwrap();
        }
    }
}
