use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Canvas {
    pub w: u32,
    pub h: u32,
    pub fps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub updated_at: String,
    pub orientation: Orientation,
    pub canvas: Canvas,
    pub auto_join: bool,
    pub copy_media: bool,
    pub media: Vec<Media>,
    pub main: Vec<Clip>,
    pub overlays: Vec<Overlay>,
    pub audio: Vec<AudioClip>,
    pub tool_data: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub id: String,
    pub kind: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rel_path: Option<String>,
    pub duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub w: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub h: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<f64>,
    pub has_audio: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Crop {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub media_id: String,
    pub start: f64,
    pub src_start: f64,
    pub src_end: f64,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextStyle {
    pub font: String,
    pub size: f64,
    pub color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bg_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bg_opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bg_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    pub align: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Overlay {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub start: f64,
    pub duration: f64,
    pub pos_x: f64,
    pub pos_y: f64,
    pub scale: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<TextStyle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src_start: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src_end: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioClip {
    pub id: String,
    pub media_id: String,
    pub start: f64,
    pub src_start: f64,
    pub src_end: f64,
    pub speed: f64,
    pub volume: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track: Option<u32>,
}

impl Project {
    pub fn new(name: String, orientation: Orientation) -> Self {
        let (w, h) = match orientation {
            Orientation::Horizontal => (1920, 1080),
            Orientation::Vertical => (1080, 1920),
        };
        Self {
            version: 1,
            id: Uuid::new_v4().to_string(),
            name,
            updated_at: Utc::now().to_rfc3339(),
            orientation,
            canvas: Canvas { w, h, fps: 30.0 },
            auto_join: true,
            copy_media: false,
            media: vec![],
            main: vec![],
            overlays: vec![],
            audio: vec![],
            tool_data: Map::new(),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err(
                "Versión de proyecto no compatible. No se ha modificado el archivo.".into(),
            );
        }
        if Uuid::parse_str(&self.id).is_err() {
            return Err("El identificador del proyecto no es válido.".into());
        }
        if self.name.trim().is_empty()
            || self.name.chars().count() > 120
            || self.name.chars().any(char::is_control)
        {
            return Err(
                "El nombre debe tener entre 1 y 120 caracteres, sin saltos de línea.".into(),
            );
        }
        let size = match self.orientation {
            Orientation::Horizontal => (1920, 1080),
            Orientation::Vertical => (1080, 1920),
        };
        if (self.canvas.w, self.canvas.h) != size
            || !self.canvas.fps.is_finite()
            || self.canvas.fps <= 0.0
            || self.canvas.fps > 60.0
        {
            return Err("El lienzo del proyecto no es válido.".into());
        }
        if chrono::DateTime::parse_from_rfc3339(&self.updated_at).is_err() {
            return Err("La fecha del proyecto no es válida.".into());
        }
        let mut ids = HashSet::new();
        for media in &self.media {
            if !ids.insert(&media.id)
                || media.id.is_empty()
                || !["video", "audio", "image"].contains(&media.kind.as_str())
                || media.path.is_empty()
                || !media.duration.is_finite()
                || media.duration < 0.0
            {
                return Err("La biblioteca de medios del proyecto no es válida.".into());
            }
        }
        let valid_segment = |start: f64, from: f64, to: f64, speed: f64, volume: f64| {
            [start, from, to, speed, volume]
                .iter()
                .all(|x| x.is_finite())
                && start >= 0.0
                && from >= 0.0
                && to > from
                && (0.25..=4.0).contains(&speed)
                && (0.0..=2.0).contains(&volume)
        };
        let mut item_ids = HashSet::new();
        let mut previous_end = 0.0;
        for clip in &self.main {
            let source = self.media.iter().find(|m| m.id == clip.media_id);
            if !item_ids.insert(&clip.id)
                || clip.id.is_empty()
                || !ids.contains(&clip.media_id)
                || source.is_some_and(|m| m.kind != "video" || clip.src_end > m.duration + 0.000001)
                || !valid_segment(
                    clip.start,
                    clip.src_start,
                    clip.src_end,
                    clip.speed,
                    clip.volume,
                )
            {
                return Err("Un clip principal no es válido.".into());
            }
            if clip.start + 0.000001 < previous_end
                || (self.auto_join && (clip.start - previous_end).abs() > 0.000001)
            {
                return Err("La posición de los clips no respeta la unión automática o contiene solapamientos.".into());
            }
            previous_end = clip.start + (clip.src_end - clip.src_start) / clip.speed;
            let crop = &clip.crop;
            if [clip.zoom, clip.stretch_x, clip.stretch_y, crop.w, crop.h]
                .iter()
                .any(|x| !x.is_finite() || *x <= 0.0)
                || [clip.pos_x, clip.pos_y, crop.x, crop.y]
                    .iter()
                    .any(|x| !x.is_finite())
                || crop.x < 0.0
                || crop.y < 0.0
                || crop.x + crop.w > 1.000001
                || crop.y + crop.h > 1.000001
                || [clip.zoom, clip.stretch_x, clip.stretch_y]
                    .iter()
                    .any(|x| !(0.01..=100.0).contains(x))
                || !(0.1 - 1e-8..=10.0 + 1e-8).contains(&(clip.zoom * clip.stretch_x))
                || !(0.1 - 1e-8..=10.0 + 1e-8).contains(&(clip.zoom * clip.stretch_y))
                || clip.pos_x.abs() > self.canvas.w as f64 * 2.0
                || clip.pos_y.abs() > self.canvas.h as f64 * 2.0
                || crop.w < 2.0 / source.and_then(|m| m.w).unwrap_or(self.canvas.w) as f64 - 1e-8
                || crop.h < 2.0 / source.and_then(|m| m.h).unwrap_or(self.canvas.h) as f64 - 1e-8
            {
                return Err("La geometría de un clip no es válida.".into());
            }
        }
        for audio in &self.audio {
            let source = self.media.iter().find(|m| m.id == audio.media_id);
            if !item_ids.insert(&audio.id)
                || audio.id.is_empty()
                || !ids.contains(&audio.media_id)
                || source.is_some_and(|m| !m.has_audio || audio.src_end > m.duration + 0.000001)
                || audio.track.is_some_and(|track| track > 1000)
                || !valid_segment(
                    audio.start,
                    audio.src_start,
                    audio.src_end,
                    audio.speed,
                    audio.volume,
                )
            {
                return Err("Una pista de audio no es válida.".into());
            }
        }
        for overlay in &self.overlays {
            if !item_ids.insert(&overlay.id)
                || overlay.id.is_empty()
                || !["text", "image", "video"].contains(&overlay.kind.as_str())
                || [
                    overlay.start,
                    overlay.duration,
                    overlay.scale,
                    overlay.pos_x,
                    overlay.pos_y,
                ]
                .iter()
                .any(|x| !x.is_finite())
                || overlay.start < 0.0
                || overlay.duration <= 0.0
                || !(0.1..=10.0).contains(&overlay.scale)
                || overlay.pos_x.abs() > self.canvas.w as f64 * 2.0
                || overlay.pos_y.abs() > self.canvas.h as f64 * 2.0
                || overlay.track.is_some_and(|track| track > 1000)
                || (overlay.kind == "image"
                    && !self
                        .media
                        .iter()
                        .any(|m| Some(&m.id) == overlay.media_id.as_ref() && m.kind == "image"))
                || (overlay.kind == "video"
                    && !self.media.iter().any(|m| {
                        Some(&m.id) == overlay.media_id.as_ref()
                            && m.kind == "video"
                            && match (
                                overlay.src_start,
                                overlay.src_end,
                                overlay.speed,
                                overlay.volume,
                            ) {
                                (Some(from), Some(to), Some(speed), Some(volume)) => {
                                    valid_segment(overlay.start, from, to, speed, volume)
                                        && to <= m.duration + 1e-6
                                        && ((to - from) / speed - overlay.duration).abs() <= 1e-6
                                }
                                _ => false,
                            }
                    }))
                || (overlay.kind == "text"
                    && (overlay.text.as_ref().is_none_or(|text| text.len() > 20_000)
                        || overlay.style.as_ref().is_none_or(|style| {
                            !style.size.is_finite()
                                || !(8.0..=500.0).contains(&style.size)
                                || !["left", "center", "right"].contains(&style.align.as_str())
                                || style
                                    .opacity
                                    .is_some_and(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
                                || style
                                    .bg_opacity
                                    .is_some_and(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
                        })))
            {
                return Err("Una capa no es válida.".into());
            }
        }
        Ok(())
    }
}
