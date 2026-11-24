# Extracción y reanudación

Requiere Python 3, FFmpeg, FFprobe y una fuente TTF para los rótulos. Sin Pillow, OpenCV ni paquetes Python. En Windows los procesos se ejecutan sin ventanas. Los originales del video permanecen intactos.

Sustituir los marcadores con rutas absolutas; estos comandos son ejemplos, no usan tiempos universales.

## Exploración

```powershell
python "<skill>/scripts/extract_frames.py" --video "<video>" --output "<salida>" --sample-count 24 --role S --columns 4 --preview-width 320
```

Localiza FFmpeg y FFprobe en PATH o en los binarios de editor_videos si se ejecuta desde el proyecto. Admite `--ffmpeg <ruta>`, `--ffprobe <ruta>` y `--font <fuente.ttf>`. En este equipo: `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` y su FFprobe correspondiente.

Ver la hoja indicada en el JSON de salida. Puede contener noticias, documentos, recuadros pequeños o transiciones: el agente debe distinguirlos antes de proponer personas.

## Refinar y proponer

```powershell
python "<skill>/scripts/extract_frames.py" --video "<video>" --output "<salida>" --start 1360 --end 1390 --sample-count 20 --role S --columns 4
python "<skill>/scripts/extract_frames.py" --video "<video>" --output "<salida>" --times "1455,1580,1810,1830" --role E --columns 2 --preview-width 600
python "<skill>/scripts/extract_frames.py" --video "<video>" --output "<salida>" --times "1374,1381.5,1383,1384.5" --role P --columns 2 --preview-width 600
```

Tiempos en segundos del original; estos corresponden solo a la segunda prueba aprobada. `--crop ancho:alto:x:y` afecta únicamente a las vistas de la hoja; comprobar que conserva ojos y cabeza. Los JPEG de `originals/` mantienen el fotograma completo.

## Otra ronda

El mismo directorio mantiene `candidates.json` con los IDs, tiempos y `rounds`. Las nuevas opciones continúan la numeración por rol; el mismo instante y rol recupera su ID anterior. Cada ejecución guarda una hoja nueva y mantiene las previas. Ejecutar secuencialmente dentro del mismo directorio.

- Si mantiene E2 y pide otras presentadoras, conservar E2 y extraer nuevos tiempos con `--role P`: P5, P6...
- Si pide algo parecido a P1, revisar su tiempo y explorar antes y después.
- Para otro video, usar otro directorio: el script rechaza mezclar fuentes.
- La hoja no equivale a elección. Guardar la elección explícita en `composition.json`, aparte del catálogo.

Ese registro conserva: fuente del video, IDs elegidos y tiempos/archivos, contexto, sujeto del círculo, texto, comillas y condición de reformulación, URL/crédito del retrato, prompts, rutas de versiones y estado real (esperando selección, texto, revisión o aprobado).

## Referencias aprobadas

- `assets/approved-01.png`: E1 13:03, P2 13:00, círculo de Carlos Espá, «SERÁ INVESTIGADO POR FISCALÍA Y CONTRALORÍA». Retrato: [Andina](https://andina.pe/agencia/noticia-elecciones-2026-carlos-espa-propone-crear-cinco-penales-maxima-seguridad-1061084.aspx).
- `assets/approved-02.png`: E1 24:15, P1 22:54, círculo de Rafael López Aliaga, «CUANDO PIERDA, NO VA A ACEPTAR SER MI REGIDOR». Retrato: [El Comercio](https://elcomercio.pe/politica/actualidad/rafael-lopez-aliaga-alcalde-de-lima-por-culpa-de-la-corrupcion-no-importaba-que-la-gente-demorara-la-vida-en-transportarse-entrevista-noticia/).

Ambas composiciones fueron aprobadas. La segunda conserva la chaqueta oscura del video; la muestra original contenía una captura reutilizada con chaqueta blanca. No copiar ropa ni caras de las muestras en nuevos trabajos.
