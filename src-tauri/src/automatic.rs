use crate::{media, model::Media};
use serde::Serialize;
use std::{
    collections::VecDeque,
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub job_id: String,
    pub percent: f64,
    pub stage: String,
}

#[derive(Serialize)]
pub struct DownloadResult {
    pub cancelled: bool,
    pub media: Option<Media>,
    pub title: String,
    pub folder: String,
}

pub fn youtube_url(input: &str) -> Result<String, String> {
    let error = "Introduce un enlace de un video individual de YouTube (youtube.com o youtu.be).";
    let url = tauri::Url::parse(input.trim()).map_err(|_| error)?;
    if !["https", "http"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err(error.into());
    }
    let host = url.host_str().ok_or(error)?;
    let segments: Vec<_> = url
        .path_segments()
        .ok_or(error)?
        .filter(|s| !s.is_empty())
        .collect();
    let id = if host == "youtu.be" && segments.len() == 1 {
        segments[0].to_string()
    } else if [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
    ]
    .contains(&host)
    {
        if segments == ["watch"] {
            url.query_pairs()
                .find(|(key, _)| key == "v")
                .map(|(_, value)| value.into_owned())
                .ok_or(error)?
        } else if segments.len() == 2 && ["shorts", "embed", "live"].contains(&segments[0]) {
            segments[1].to_string()
        } else {
            return Err(error.into());
        }
    } else {
        return Err(error.into());
    };
    if id.len() != 11
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return Err(error.into());
    }
    // Drop playlist, timestamp and tracking parameters. Never invoke a generic URL extractor.
    Ok(format!("https://www.youtube.com/watch?v={id}"))
}

fn format_selector(quality: &str) -> Result<String, String> {
    let resolutions = match quality {
        "1080" => vec![1080, 720],
        "720" => vec![720],
        _ => return Err("Elige descarga en 720p o 1080p.".into()),
    };
    let mut alternatives = vec![];
    for r in resolutions {
        // Shortest side defines quality, including portrait videos. Never upscale or select 4K.
        let landscape = format!("[height={r}][width>={r}]");
        let portrait = format!("[width={r}][height>={r}]");
        alternatives.extend([
            format!("bv*{landscape}+ba"),
            format!("bv*{portrait}+ba"),
            format!("b{landscape}"),
            format!("b{portrait}"),
            format!("bv{landscape}"),
            format!("bv{portrait}"),
        ]);
    }
    Ok(alternatives.join("/"))
}

fn stop_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        // yt-dlp may have an FFmpeg or JavaScript child; cancel the entire tree.
        let _ = media::command(Path::new("taskkill.exe"))
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn pipe_lines(
    pipe: impl Read + Send + 'static,
    sender: mpsc::Sender<String>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        for line in BufReader::new(pipe).lines().map_while(Result::ok) {
            if sender.send(line).is_err() {
                break;
            }
        }
    })
}

pub fn download(
    root: &Path,
    downloader: &Path,
    node: &Path,
    ffmpeg: &Path,
    ffprobe: &Path,
    url: &str,
    quality: &str,
    job_id: &str,
    cancel: &AtomicBool,
    report: impl Fn(Progress),
) -> Result<DownloadResult, String> {
    let url = youtube_url(url)?;
    let selector = format_selector(quality)?;
    let id = uuid::Uuid::parse_str(job_id).map_err(|_| "Identificador de trabajo no válido.")?;
    let parent = root.join("Automaticos");
    fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    let parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
    let folder = parent.join(id.to_string());
    fs::create_dir(&folder).map_err(|e| format!("No se pudo crear la carpeta del trabajo: {e}"))?;
    let result = download_into(
        &folder, downloader, node, ffmpeg, ffprobe, &url, &selector, job_id, cancel, report,
    );
    if result.as_ref().map(|r| r.cancelled).unwrap_or(true) {
        // Only the unique, validated work directory created by this invocation is disposable.
        if folder.parent() == Some(parent.as_path())
            && folder.file_name() == Some(std::ffi::OsStr::new(&id.to_string()))
        {
            let _ = fs::remove_dir_all(&folder);
        }
    }
    result
}

fn download_into(
    folder: &Path,
    downloader: &Path,
    node: &Path,
    ffmpeg: &Path,
    ffprobe: &Path,
    url: &str,
    selector: &str,
    job_id: &str,
    cancel: &AtomicBool,
    report: impl Fn(Progress),
) -> Result<DownloadResult, String> {
    let cancelled = || DownloadResult {
        cancelled: true,
        media: None,
        title: String::new(),
        folder: String::new(),
    };
    if cancel.load(Ordering::SeqCst) {
        return Ok(cancelled());
    }
    report(Progress {
        job_id: job_id.into(),
        percent: 0.0,
        stage: "Consultando YouTube y descargando".into(),
    });
    let output = folder.join("original.%(ext)s");
    let mut child = media::command(downloader)
        .args([
            "--ignore-config",
            "--no-plugin-dirs",
            "--no-remote-components",
            "--no-cache-dir",
            "--no-playlist",
            "--no-simulate",
            "--no-continue",
            "--no-overwrites",
            "--socket-timeout",
            "20",
            "--retries",
            "3",
            "--fragment-retries",
            "3",
            "--match-filter",
            "!is_live & !is_upcoming",
            "--no-js-runtimes",
            "--js-runtimes",
        ])
        .arg(format!("node:{}", node.display()))
        .arg("--ffmpeg-location")
        .arg(ffmpeg)
        .args([
            "--format",
            selector,
            "--merge-output-format",
            "mkv",
            "--remux-video",
            "mkv",
            "--newline",
            "--progress",
            "--progress-delta",
            "0.5",
            "--progress-template",
            "download:PROGRESS:%(progress._percent_str)s",
            "--print",
            "after_move:PATH:%(filepath)j",
            "--print",
            "after_move:TITLE:%(title)j",
            "--output",
        ])
        .arg(output)
        .arg("--")
        .arg(url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo iniciar la descarga de YouTube: {e}"))?;
    let (sender, receiver) = mpsc::channel();
    let stdout = pipe_lines(
        child.stdout.take().ok_or("No se pudo leer la descarga.")?,
        sender.clone(),
    );
    let stderr = pipe_lines(
        child
            .stderr
            .take()
            .ok_or("No se pudo leer el error de descarga.")?,
        sender,
    );
    let started = Instant::now();
    let mut lines = VecDeque::new();
    let mut path = None;
    let mut title = String::from("Video de YouTube");
    let mut accept_line = |line: String| {
        if let Some(value) = line.strip_prefix("PATH:") {
            path = serde_json::from_str::<String>(value)
                .ok()
                .map(PathBuf::from);
        } else if let Some(value) = line.strip_prefix("TITLE:") {
            if let Ok(value) = serde_json::from_str::<String>(value) {
                title = value;
            }
        } else if let Some(value) = line.strip_prefix("PROGRESS:") {
            if let Ok(percent) = value.trim().trim_end_matches('%').parse::<f64>() {
                if percent.is_finite() {
                    report(Progress {
                        job_id: job_id.into(),
                        percent: percent.clamp(0.0, 100.0),
                        stage: "Descargando video y audio".into(),
                    });
                }
            }
        } else {
            if lines.len() == 25 {
                lines.pop_front();
            }
            lines.push_back(line);
        }
    };
    let status = loop {
        for line in receiver.try_iter() {
            accept_line(line);
        }
        if cancel.load(Ordering::SeqCst) || started.elapsed() > Duration::from_secs(7200) {
            stop_tree(&mut child);
            let _ = stdout.join();
            let _ = stderr.join();
            if cancel.load(Ordering::SeqCst) {
                return Ok(cancelled());
            }
            return Err("La descarga superó el tiempo máximo de dos horas.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(error) => {
                stop_tree(&mut child);
                return Err(error.to_string());
            }
        }
    };
    let _ = stdout.join();
    let _ = stderr.join();
    for line in receiver.try_iter() {
        accept_line(line);
    }
    if cancel.load(Ordering::SeqCst) {
        return Ok(cancelled());
    }
    if !status.success() {
        return Err(format!("No se pudo descargar el video en 720p/1080p. Revisa el enlace y la disponibilidad en YouTube.\n{}", lines.into_iter().collect::<Vec<_>>().join("\n")));
    }
    let path = media::local_path(&path.ok_or("YouTube no entregó un video descargable. No se admiten directos en curso ni estrenos pendientes.")?)?;
    let canonical_folder = fs::canonicalize(folder).map_err(|e| e.to_string())?;
    if path.parent() != Some(dunce::simplified(&canonical_folder)) {
        return Err("La descarga no quedó dentro de la carpeta del trabajo.".into());
    }
    report(Progress {
        job_id: job_id.into(),
        percent: 100.0,
        stage: "Comprobando video descargado".into(),
    });
    let media = media::probe(&path, ffprobe)?;
    let resolution = media.w.unwrap_or(0).min(media.h.unwrap_or(0));
    if media.kind != "video" || ![720, 1080].contains(&resolution) {
        return Err("La descarga no tiene una resolución válida de 720p o 1080p.".into());
    }
    let record = serde_json::json!({ "version": 1, "url": url, "title": title, "media": media });
    fs::write(
        folder.join("descarga.json"),
        serde_json::to_vec_pretty(&record).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(DownloadResult {
        cancelled: false,
        media: Some(media),
        title,
        folder: dunce::simplified(&canonical_folder)
            .to_string_lossy()
            .into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalizes_only_individual_youtube_links() {
        for url in [
            "https://youtu.be/BaW_jenozKc?t=3",
            "https://www.youtube.com/watch?v=BaW_jenozKc&list=123",
            "https://m.youtube.com/shorts/BaW_jenozKc",
        ] {
            assert_eq!(
                youtube_url(url).unwrap(),
                "https://www.youtube.com/watch?v=BaW_jenozKc"
            );
        }
        for url in [
            "file:///video.mp4",
            "https://youtube.com.evil.test/watch?v=BaW_jenozKc",
            "https://youtube.com/playlist?list=x",
            "https://evil.test/",
            "https://user@youtube.com/watch?v=BaW_jenozKc",
            "https://youtube.com/redirect?v=BaW_jenozKc",
            "--exec=bad",
        ] {
            assert!(youtube_url(url).is_err(), "{url}");
        }
    }
    #[test]
    fn quality_uses_exact_short_side_and_fallback_only_when_requested() {
        let selector = format_selector("1080").unwrap();
        assert!(selector.find("height=1080").unwrap() < selector.find("height=720").unwrap());
        assert!(selector.contains("[width=1080][height>=1080]"));
        assert!(!format_selector("720").unwrap().contains("1080"));
        assert!(format_selector("480").is_err());
    }

    #[test]
    fn real_downloader_selects_resolution_fallback_portrait_and_silent_sources_offline() {
        let binary = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/yt-dlp-x86_64-pc-windows-msvc.exe");
        if !binary.is_file() {
            return;
        }
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../.local/rust-tests")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let video = |id: &str, w: u32, h: u32| {
            serde_json::json!({
                "format_id": id, "url": "https://example.invalid/video.mp4", "ext": "mp4",
                "width": w, "height": h, "vcodec": "h264", "acodec": "none", "fps": 30,
            })
        };
        let audio = serde_json::json!({"format_id":"audio", "url":"https://example.invalid/audio.m4a", "ext":"m4a", "vcodec":"none", "acodec":"aac"});
        for (name, quality, formats, expected) in [
            (
                "prefer1080",
                "1080",
                vec![
                    video("480", 854, 480),
                    video("720", 1280, 720),
                    video("1080", 1920, 1080),
                    audio.clone(),
                ],
                Some("1080+audio"),
            ),
            (
                "fallback720",
                "1080",
                vec![
                    video("480", 854, 480),
                    video("720", 1280, 720),
                    audio.clone(),
                ],
                Some("720+audio"),
            ),
            (
                "portrait",
                "720",
                vec![
                    video("vertical", 720, 1280),
                    video("1080", 1080, 1920),
                    audio.clone(),
                ],
                Some("vertical+audio"),
            ),
            (
                "silent",
                "720",
                vec![video("silent", 1280, 720)],
                Some("silent"),
            ),
            (
                "unavailable",
                "1080",
                vec![video("480", 854, 480), audio],
                None,
            ),
        ] {
            let path = root.join(format!("{name}.json"));
            fs::write(&path, serde_json::to_vec(&serde_json::json!({
                "id":"BaW_jenozKc", "title":"Fixture", "extractor":"youtube", "extractor_key":"Youtube",
                "webpage_url":"https://www.youtube.com/watch?v=BaW_jenozKc", "formats":formats,
            })).unwrap()).unwrap();
            let output = media::command(&binary)
                .args([
                    "--ignore-config",
                    "--no-plugin-dirs",
                    "--no-warnings",
                    "--simulate",
                    "--print",
                    "format_id",
                    "--format",
                    &format_selector(quality).unwrap(),
                    "--load-info-json",
                ])
                .arg(&path)
                .output()
                .unwrap();
            match expected {
                Some(expected) => {
                    assert!(
                        output.status.success(),
                        "{name}: {}",
                        String::from_utf8_lossy(&output.stderr)
                    );
                    assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), expected);
                }
                None => assert!(
                    !output.status.success(),
                    "No debe elegir 480p silenciosamente"
                ),
            }
        }
        // Unique fixture directory, created by this test under the workspace.
        fs::remove_dir_all(root).unwrap();
    }
}
