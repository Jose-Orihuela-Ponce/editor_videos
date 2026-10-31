use crate::model::{Media, Project};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, SystemTime},
};
use tauri::Manager;

pub fn tool_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let mut paths = vec![];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            paths.push(parent.join(format!("{name}.exe")));
        }
    }
    if let Ok(root) = app.path().resource_dir() {
        paths.push(root.join(format!("{name}.exe")));
    }
    #[cfg(debug_assertions)]
    paths.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("{name}-x86_64-pc-windows-msvc.exe")),
    );
    paths
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| format!("No se encontró el motor {name}. Ejecuta npm run sidecars."))
}

pub fn command(path: &Path) -> Command {
    let mut command = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.stdin(Stdio::null());
    command
}

pub fn local_path(path: &Path) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|_| format!("No se encontró {}.", path.display()))?;
    if !canonical.is_file() {
        return Err("Selecciona un archivo de medios.".into());
    }
    Ok(dunce::simplified(&canonical).to_path_buf())
}

/// Cache a preview-only H.264 copy; the original remains the export source.
pub fn proxy(path: &Path, ffmpeg: &Path, root: &Path) -> Result<PathBuf, String> {
    let source = local_path(path)?;
    let metadata = fs::metadata(&source).map_err(|e| e.to_string())?;
    let mut hash = DefaultHasher::new();
    source.hash(&mut hash);
    metadata.len().hash(&mut hash);
    metadata
        .modified()
        .map_err(|e| e.to_string())?
        .hash(&mut hash);
    let cache = root.join("cache/proxies");
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let target = cache.join(format!("{:x}.mp4", hash.finish()));
    if target.is_file() {
        return Ok(target);
    }
    let temporary = cache.join(format!("{}.mp4", uuid::Uuid::new_v4()));
    let result = command(ffmpeg)
        .args(["-v", "error", "-nostdin", "-y", "-i"])
        .arg(&source)
        .args([
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
        ])
        .arg(&temporary)
        .output()
        .map_err(|e| format!("No se pudo crear la vista previa: {e}"));
    match result {
        Ok(output) if output.status.success() => {
            if let Err(e) = fs::rename(&temporary, &target) {
                let _ = fs::remove_file(&temporary);
                if !target.is_file() {
                    return Err(format!("No se pudo guardar la vista previa: {e}"));
                }
            }
            Ok(target)
        }
        Ok(output) => {
            let _ = fs::remove_file(&temporary);
            Err(format!(
                "No se pudo crear la vista previa: {}",
                String::from_utf8_lossy(&output.stderr)
                    .lines()
                    .next()
                    .unwrap_or("error de FFmpeg")
            ))
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            Err(error)
        }
    }
}

fn rate(value: Option<&str>) -> Option<f64> {
    let value = value?;
    let result = if let Some((a, b)) = value.split_once('/') {
        a.parse::<f64>().ok()? / b.parse::<f64>().ok()?
    } else {
        value.parse::<f64>().ok()?
    };
    (result.is_finite() && result > 0.0).then_some(result)
}

pub fn probe(path: &Path, ffprobe: &Path) -> Result<Media, String> {
    let path = local_path(path)?;
    let output = command(ffprobe)
        .args([
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe,crypto,data",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
        ])
        .arg(&path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "No se pudo analizar {}. El archivo puede estar dañado.",
            path.file_name().unwrap_or_default().to_string_lossy()
        ));
    }
    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "No se pudo leer la información del archivo.")?;
    let streams = value["streams"]
        .as_array()
        .ok_or("El archivo no contiene pistas.")?;
    let video = streams
        .iter()
        .find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"] != 1);
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let image = ["png", "jpg", "jpeg", "bmp", "webp"].contains(&extension.as_str());
    let audio_only =
        ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"].contains(&extension.as_str());
    let kind = if image {
        "image"
    } else if audio_only || video.is_none() {
        "audio"
    } else {
        "video"
    };
    if kind == "audio" && audio.is_none() {
        return Err("El archivo no contiene audio.".into());
    }
    if kind != "audio" && video.is_none() {
        return Err("El archivo no contiene una imagen o video válido.".into());
    }
    let stream = if kind == "audio" {
        audio.unwrap()
    } else {
        video.unwrap()
    };
    let duration = if kind == "image" {
        0.0
    } else {
        rate(stream["duration"].as_str())
            .or_else(|| rate(value["format"]["duration"].as_str()))
            .ok_or("No se pudo determinar la duración del archivo.")?
    };
    let mut w = stream["width"].as_u64().unwrap_or(0) as u32;
    let mut h = stream["height"].as_u64().unwrap_or(0) as u32;
    if kind != "audio" && (w == 0 || h == 0) {
        return Err("La imagen o el video no tiene un tamaño válido.".into());
    }
    let rotation = stream["side_data_list"]
        .as_array()
        .and_then(|a| a.iter().find_map(|s| s["rotation"].as_f64()))
        .unwrap_or_else(|| {
            stream["tags"]["rotate"]
                .as_str()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.0)
        });
    if (rotation.abs() % 180.0 - 90.0).abs() < 1.0 {
        std::mem::swap(&mut w, &mut h);
    }
    Ok(Media {
        id: uuid::Uuid::new_v4().to_string(),
        kind: kind.into(),
        path: path.to_string_lossy().into(),
        rel_path: None,
        duration,
        w: (kind != "audio").then_some(w),
        h: (kind != "audio").then_some(h),
        fps: if kind == "video" {
            rate(stream["avg_frame_rate"].as_str())
                .or_else(|| rate(stream["r_frame_rate"].as_str()))
        } else {
            None
        },
        has_audio: kind != "image" && audio.is_some(),
        thumbnail: None,
    })
}

pub fn thumbnail(media: &Media, ffmpeg: &Path, root: &Path) -> Option<PathBuf> {
    let path = Path::new(&media.path);
    let metadata = fs::metadata(path).ok()?;
    let mut hash = DefaultHasher::new();
    media.path.hash(&mut hash);
    metadata.len().hash(&mut hash);
    metadata
        .modified()
        .ok()?
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_nanos()
        .hash(&mut hash);
    let cache = root.join("cache/media");
    fs::create_dir_all(&cache).ok()?;
    let target = cache.join(format!("{:x}.jpg", hash.finish()));
    if !target.is_file() {
        let mut child = command(ffmpeg)
            .args([
                "-v",
                "error",
                "-nostdin",
                "-ss",
                &format!("{:.6}", (media.duration * 0.1).min(1.0)),
                "-i",
            ])
            .arg(path)
            .args([
                "-frames:v",
                "1",
                "-vf",
                "scale=240:160:force_original_aspect_ratio=decrease",
                "-q:v",
                "4",
                "-y",
            ])
            .arg(&target)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let limit = std::time::Instant::now();
        loop {
            match child.try_wait().ok()? {
                Some(status) => {
                    if !status.success() {
                        return None;
                    }
                    break;
                }
                None if limit.elapsed() > Duration::from_secs(12) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                _ => std::thread::sleep(Duration::from_millis(30)),
            }
        }
    }
    target
        .canonicalize()
        .ok()
        .map(|p| dunce::simplified(&p).to_path_buf())
}

#[derive(Serialize)]
pub struct ImportResult {
    pub media: Vec<Media>,
    pub warnings: Vec<String>,
}

pub fn import(
    paths: Vec<String>,
    root: PathBuf,
    app: tauri::AppHandle,
) -> Result<ImportResult, String> {
    let ffprobe = tool_path(&app, "ffprobe")?;
    let ffmpeg = tool_path(&app, "ffmpeg")?;
    let mut result = ImportResult {
        media: vec![],
        warnings: vec![],
    };
    for path in paths {
        match probe(Path::new(&path), &ffprobe) {
            Ok(mut media) => {
                app.asset_protocol_scope()
                    .allow_file(&media.path)
                    .map_err(|e| e.to_string())?;
                if media.kind == "image" {
                    media.thumbnail = Some(media.path.clone());
                } else if media.kind == "video" {
                    if let Some(path) = thumbnail(&media, &ffmpeg, &root) {
                        app.asset_protocol_scope()
                            .allow_file(&path)
                            .map_err(|e| e.to_string())?;
                        media.thumbnail = Some(path.to_string_lossy().into());
                    }
                }
                result.media.push(media);
            }
            Err(error) => result.warnings.push(error),
        }
    }
    Ok(result)
}

pub fn authorize(project: &Project, app: &tauri::AppHandle) {
    for media in &project.media {
        if let Ok(path) = local_path(Path::new(&media.path)) {
            let _ = app.asset_protocol_scope().allow_file(path);
        }
        if let Some(path) = &media.thumbnail {
            if Path::new(path).is_file() {
                let _ = app.asset_protocol_scope().allow_file(path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_fractional_fps_without_accepting_unknown_or_zero_rates() {
        assert!((rate(Some("30000/1001")).unwrap() - 29.97002997).abs() < 1e-8);
        assert_eq!(rate(Some("0/0")), None);
        assert_eq!(rate(Some("N/A")), None);
        assert_eq!(rate(Some("0")), None);
    }
}
