"""Extract source frames and append stable candidate IDs and labeled contact sheets."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


def run(command):
    result = subprocess.run(
        [str(arg) for arg in command], capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=120,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode:
        raise ValueError(result.stderr[-2000:].strip() or "Falló el proceso multimedia.")
    return result.stdout


def find_tool(name, explicit):
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if candidate.is_file():
            return candidate
        raise ValueError(f"No existe {name}: {candidate}")
    found = shutil.which(name)
    if found:
        return Path(found)
    roots = [Path.cwd(), Path(__file__).resolve().parents[3]]
    for root in roots:
        candidate = root / "src-tauri" / "binaries" / f"{name}-x86_64-pc-windows-msvc.exe"
        if candidate.is_file():
            return candidate
    raise ValueError(f"No se encontró {name}; indicar --{name} con su ruta.")


def find_font(explicit):
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if candidate.is_file():
            return candidate
        raise ValueError("No existe la fuente indicada.")
    candidates = [
        Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/arialbd.ttf",
        Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/arial.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path.cwd() / "public/fonts/Montserrat.ttf",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise ValueError("Indicar una fuente TTF con --font.")


def atomic_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description="Extraer candidatos y hojas sin modificar el video.")
    parser.add_argument("--video", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--role", choices=["S", "E", "P"], default="S")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--times", help="Segundos separados por comas.")
    group.add_argument("--sample-count", type=int)
    parser.add_argument("--start", type=float)
    parser.add_argument("--end", type=float)
    parser.add_argument("--ffmpeg")
    parser.add_argument("--ffprobe")
    parser.add_argument("--font")
    parser.add_argument("--preview-width", type=int, default=480)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--crop", help="Solo para la hoja: ancho:alto:x:y.")
    args = parser.parse_args()
    video = Path(args.video).expanduser().resolve(strict=True)
    output = Path(args.output).expanduser().resolve()
    if not video.is_file():
        raise ValueError("La fuente no es un archivo.")
    if not 120 <= args.preview_width <= 1280 or not 1 <= args.columns <= 8:
        raise ValueError("Ancho permitido: 120–1280; columnas: 1–8.")
    if args.crop and not re.fullmatch(r"[1-9]\d*:[1-9]\d*:\d+:\d+", args.crop):
        raise ValueError("Recorte inválido; usar ancho:alto:x:y en píxeles.")
    if args.times is not None and (args.start is not None or args.end is not None):
        raise ValueError("Usar tiempos explícitos o un intervalo, no ambos.")

    ffmpeg = find_tool("ffmpeg", args.ffmpeg)
    ffprobe_hint = args.ffprobe
    if not ffprobe_hint:
        sibling = ffmpeg.with_name(ffmpeg.name.replace("ffmpeg", "ffprobe"))
        if sibling.is_file():
            ffprobe_hint = str(sibling)
    ffprobe = find_tool("ffprobe", ffprobe_hint)
    font = find_font(args.font)
    probe = json.loads(run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", video]))
    duration = float(probe["format"]["duration"])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("No se pudo determinar una duración válida.")
    if args.times is not None:
        samples = [float(value.strip()) for value in args.times.split(",")]
        if not 1 <= len(samples) <= 120:
            raise ValueError("Indicar entre 1 y 120 tiempos.")
    else:
        count = args.sample_count if args.sample_count is not None else 24
        start = args.start if args.start is not None else 0
        end = args.end if args.end is not None else duration
        if not 1 <= count <= 120 or not 0 <= start < end <= duration:
            raise ValueError("Cantidad o intervalo fuera de los límites del video.")
        samples = [start + (end - start) * (index + 0.5) / count for index in range(count)]
    samples = list(dict.fromkeys(round(seconds, 6) for seconds in samples))
    if any(not math.isfinite(seconds) or not 0 <= seconds < duration for seconds in samples):
        raise ValueError("Hay tiempos fuera del video.")

    info = video.stat()
    source = {"path": str(video), "size": info.st_size, "mtimeNs": info.st_mtime_ns}
    manifest_path = output / "candidates.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("source") != source:
            raise ValueError("Este directorio pertenece a otra fuente o el original cambió. Usar otro directorio.")
    else:
        manifest = {"version": 1, "source": source, "durationSeconds": duration, "candidates": [], "rounds": []}
    output.mkdir(parents=True, exist_ok=True)
    originals = output / "originals"
    originals.mkdir(exist_ok=True)
    current = [candidate for candidate in manifest["candidates"] if candidate["role"] == args.role]
    next_index = max((int(candidate["id"][1:]) for candidate in current), default=0) + 1
    requested = []
    additions = []
    for seconds in samples:
        existing = next((candidate for candidate in current if abs(candidate["seconds"] - seconds) < 0.000001), None)
        if existing:
            requested.append(existing)
            continue
        identifier = f"{args.role}{next_index}"
        next_index += 1
        candidate = {
            "id": identifier, "role": args.role, "seconds": seconds,
            "timeLabel": f"{int(seconds // 60):02d}m{seconds % 60:06.3f}s",
            "original": f"originals/{identifier}.jpg",
        }
        additions.append(candidate)
        requested.append(candidate)

    def extract(candidate):
        path = output / candidate["original"]
        if candidate not in additions and path.is_file():
            return
        run([ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
             "-ss", candidate["seconds"], "-i", video, "-frames:v", 1, "-q:v", 2, path])

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(extract, requested))
    round_index = len(manifest["rounds"]) + 1
    sheet = output / f"{args.role}-round-{round_index:03d}.jpg"
    # Use safe temporary filenames in the filter; arbitrary source/font paths stay in argv.
    with tempfile.TemporaryDirectory(prefix="frames-", dir=output) as temporary:
        temporary = Path(temporary)
        shutil.copyfile(font, temporary / "font.ttf")
        def preview(pair):
            index, candidate = pair
            target = temporary / f"{index:03d}.jpg"
            label = f'{candidate["id"]} - {candidate["timeLabel"]}'
            filters = (f"crop={args.crop}," if args.crop else "") + (
                f"scale={args.preview_width}:-2,pad=iw:ih+36:0:36:black,"
                f"drawtext=fontfile=font.ttf:text='{label}':fontsize=22:fontcolor=white:x=8:y=5"
            )
            result = subprocess.run(
                [str(ffmpeg), "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                 "-i", str(output / candidate["original"]), "-vf", filters,
                 "-frames:v", "1", "-q:v", "2", str(target)],
                cwd=temporary, capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=120, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if result.returncode:
                raise ValueError(result.stderr[-2000:])
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(preview, enumerate(requested)))
        columns = min(args.columns, len(requested))
        rows = math.ceil(len(requested) / columns)
        run([ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
             "-framerate", 1, "-i", temporary / "%03d.jpg", "-vf",
             f"tile={columns}x{rows}:padding=4:margin=4:color=black",
             "-frames:v", 1, "-q:v", 2, sheet])
    manifest["candidates"].extend(additions)
    manifest["rounds"].append({"number": round_index, "role": args.role,
                               "ids": [candidate["id"] for candidate in requested], "sheet": sheet.name})
    atomic_json(manifest_path, manifest)
    print(json.dumps({"manifest": str(manifest_path), "sheet": str(sheet),
                      "ids": [candidate["id"] for candidate in requested],
                      "added": len(additions)}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
