# Credenciales y preparación para GitHub

## Qué se publica

Código, pruebas, documentación genérica, archivos de bloqueo, iconos, fuentes con su licencia y las dos referencias aprobadas de la skill. No se publican `.env`, JSON de OAuth, tokens, claves privadas, perfiles WebView2, originales, exportaciones ni registros de trabajos.

El `.gitignore` excluye los nombres habituales de credenciales, `.local/`, `.codex-attachments/` (adjuntos del chat), `datos/`, compilaciones, archivos de video/audio y las muestras originales `references/thumbnails/ejemplo_*/`. Un archivo ya versionado sigue en Git aunque se añada una regla de exclusión. No usar `git add -f` para publicar material ignorado. El control también rechaza adjuntos y medios completos que lleguen al índice pese a las exclusiones; las dos miniaturas aprobadas se conservan en `skills/crear-miniaturas/assets/`.

Si eliges una carpeta de datos personalizada dentro del repositorio, colócala bajo `.local/` o exclúyela antes de usarla. Guarda los JSON de Google en `.local/credentials/`. No guardes secretos en archivos con nombres arbitrarios fuera de esas carpetas.

## Drive local

`.env.example` contiene únicamente variables vacías. `scripts/authorize-drive.mjs --credentials RUTA_JSON` escribe la autorización en `.env`; no es necesario pegar tokens en el chat ni incluirlos en el código. Conserva la autorización existente al preparar el repositorio.

Nunca uses `VITE_` para secretos: Vite puede incluir esas variables en el JavaScript distribuido. Las variables `GOOGLE_DRIVE_*` solo se leen en los scripts de Node. No añadas credenciales reales a GitHub Actions; las pruebas de Drive utilizan respuestas simuladas.

El helper muestra una URL temporal de consentimiento para abrir en el mismo equipo. No compartir esa URL, el JSON de OAuth, `.env`, capturas de credenciales ni archivos `drive.json`: las sesiones de subida reanudable también son privadas. Los mensajes de error del cliente de Drive omiten los cuerpos de respuesta de Google.

Se mantiene temporalmente OAuth en modo Pruebas por decisión del usuario. La caducidad a siete días se resuelve reautorizando y reintentando la entrega del MP4 existente. El paso a producción queda pendiente; no cambia el destino de los archivos ni publica videos.

## Comprobación antes de subir

Desde la raíz del repositorio:

```powershell
npm run check:secrets -- --history
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
git diff --check
git status --short
```

Repetir la revisión de secretos después de preparar el commit. El comando comprueba:

- Archivos versionados y nuevos que Git no ignora.
- El contenido del índice, aunque difiera de la copia de trabajo.
- Con `--history`, versiones de archivos alcanzables desde las referencias locales de Git, incluidas versiones borradas, y mensajes de commits y etiquetas.
- Coincidencias con los valores privados del `.env` local, nombres de archivos privados, plantillas con valores y formatos habituales de claves o tokens.

Solo informa ruta, línea cuando corresponde y tipo de hallazgo; no muestra valores. GitHub Actions ejecuta la misma revisión con el historial descargado. La prueba automatizada verifica que detecte secretos en archivos binarios, en el índice y en versiones borradas, y que oculte sus valores.

Es una comprobación preventiva local, con reglas limitadas; no garantiza detectar credenciales desconocidas, codificadas u ofuscadas. En CI tampoco están disponibles los valores del `.env` local. Revisar los archivos del commit y activar la protección de secretos de GitHub cuando esté disponible para el repositorio.

Si se descubre una clave publicada, revocarla o rotarla primero. Borrar el archivo en un commit nuevo no elimina la copia del historial. Revisar el alcance antes de modificar historia compartida.
