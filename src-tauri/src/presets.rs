use crate::model::{Clip, Crop, Media, Orientation, Overlay, Project, TextStyle};
use crate::repository::Repository;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;

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
fn path(repo: &Repository, orientation: Orientation) -> std::path::PathBuf {
    repo.root.join("Preajustes").join(match orientation {
        Orientation::Horizontal => "horizontal.json",
        Orientation::Vertical => "vertical.json",
    })
}
pub fn load(repo: &Repository, orientation: Orientation) -> Result<Preset, String> {
    let p = path(repo, orientation);
    if !p.exists() {
        return Ok(Preset::default());
    }
    let bytes = fs::read(&p).map_err(|e| format!("No se pudo leer el preajuste: {e}"))?;
    if bytes.len() > 100_000 {
        return Err("El preajuste es demasiado grande.".into());
    }
    let preset: Preset =
        serde_json::from_slice(&bytes).map_err(|_| "El preajuste no es válido.")?;
    preset.validate(orientation)?;
    Ok(preset)
}
pub fn save(repo: &Repository, orientation: Orientation, preset: Preset) -> Result<Preset, String> {
    preset.validate(orientation)?;
    let p = path(repo, orientation);
    fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec_pretty(&preset).map_err(|e| e.to_string())?)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    if p.exists() {
        crate::repository::replace_file(&tmp, &p, None)?;
    } else {
        fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    }
    Ok(preset)
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
        let text:TextStyle=serde_json::from_value(serde_json::json!({"font":"Montserrat","size":80,"color":"#ffffff","bold":true,"italic":true,"underline":true,"bgEnabled":false,"bgOpacity":0.5,"opacity":0.8,"align":"center"})).unwrap();
        let preset = Preset {
            clip: None,
            text: Some(text),
            texts: None,
        };
        save(&repo, Orientation::Horizontal, preset.clone()).unwrap();
        let reopened = Repository::new(dir.clone());
        assert_eq!(load(&reopened, Orientation::Horizontal).unwrap(), preset);
        assert_eq!(
            load(&reopened, Orientation::Vertical).unwrap(),
            Preset::default()
        );
        let mut changed = preset.clone();
        changed.text.as_mut().unwrap().size = 110.0;
        save(&repo, Orientation::Horizontal, changed.clone()).unwrap();
        assert_eq!(load(&reopened, Orientation::Horizontal).unwrap(), changed);
        changed.text.as_mut().unwrap().opacity = Some(2.0);
        assert!(save(&repo, Orientation::Horizontal, changed).is_err());
        assert_eq!(
            load(&reopened, Orientation::Horizontal)
                .unwrap()
                .text
                .unwrap()
                .size,
            110.0
        );
        let actual = dir.canonicalize().unwrap();
        let test_root = root.canonicalize().unwrap();
        if actual.starts_with(&test_root) && actual != test_root {
            std::fs::remove_dir_all(actual).unwrap();
        }
    }
}
