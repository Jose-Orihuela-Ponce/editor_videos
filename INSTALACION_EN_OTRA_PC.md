# Instalación y continuación en otra PC

Esta guía está pensada para el equipo que conserva la versión antigua con formularios Manual/Automático. La versión actual mantiene el editor manual, pero el procesamiento por enlace se coordina desde el chat o `scripts/process-link.mjs`. Ambos usan el mismo motor Tauri. Las skills de miniaturas y corrección son recursos del agente, independientes de la exportación del MP4.

## 1. Actualizar sin perder el trabajo local

En el otro equipo, revisar `git status --short` antes de obtener cambios. Conservar sus cambios locales y resolver diferencias; no usar `reset --hard` ni limpiar carpetas de datos para actualizar. Una vez que estos cambios estén publicados en el remoto:

```powershell
git pull --ff-only
```

Si no puede avanzar por cambios o ramas divergentes, revisar la situación antes de continuar. Leer después `AGENTS.md`, `AVANCE.md` y esta guía. Las rutas absolutas de esta PC y los registros de `.local/` no forman parte del traslado por Git.

## 2. Preparar Windows y compilar la versión actual

Se necesita Windows 10/11 x64, Git, Node.js 22.12 o 24+, Rust con destino `x86_64-pc-windows-msvc`, herramientas de C++ de Microsoft y Windows SDK, WebView2, Python 3.10+ y FFmpeg/FFprobe reales con libx264 y libmp3lame. Python solo es necesario para las capturas; no requiere Pillow ni OpenCV. Los detalles de binarios y licencias están en el README y `src-tauri/binaries/*SOURCES.json`.

Desde la raíz del repositorio:

```powershell
npm ci
npm run sidecars
npm run automatic:setup
npm run skills:setup
npm run skills:check
npm test
npm run build
npx tauri build --no-bundle
npm run doctor
```

Si `sidecars` encuentra un lanzador de Chocolatey/Scoop, indicar `FFMPEG_BIN` y `FFPROBE_BIN` con las rutas de los ejecutables reales, como explica el README. `automatic:setup` prepara yt-dlp y un runtime Node, comprueba la descarga y conserva licencias; requiere Internet. `doctor` comprueba comandos y archivos, pero el propio agente debe verificar las herramientas del chat y abrir Tauri para confirmar WebView2.

La compilación genera `src-tauri/target/release/editor-video-ligero.exe`. Una copia antigua llamada `editor-video-ligero-automatico.exe` puede seguir existiendo; el script de producción la prioriza por compatibilidad. En la migración usar explícitamente el ejecutable recién compilado:

```powershell
$editorExecutable = (Resolve-Path 'src-tauri/target/release/editor-video-ligero.exe').Path
node scripts/process-link.mjs --paths --executable $editorExecutable
node scripts/process-link.mjs --list-styles --orientation horizontal --executable $editorExecutable
```

No basta con compilar la interfaz web: no prueba permisos de disco, WebView2 ni exportación nativa. Para generar un instalador después de comprobar Tauri, ejecutar `npx tauri build --bundles nsis`.

## 3. Skills y herramientas del chat

Las fuentes mantenidas son `skills/crear-miniaturas/` y `skills/corregir-textos/`. `npm run skills:setup` crea copias en `.agents/skills/`, ubicación de descubrimiento del repositorio, y registra hashes en `.local/skills-install.json`. No modifica el perfil personal del usuario. Las copias se excluyen de Git porque se reconstruyen desde la fuente.

Después de cada `git pull`, repetir `skills:setup` y `skills:check`. El sincronizador protege modificaciones propias en la copia local: si encuentra un conflicto, conservarlo, compararlo con `skills/` e integrar la mejora en la fuente. No usar una copia personal desactualizada como referencia. Si Codex no muestra las nuevas skills, reiniciarlo y comprobar de nuevo su disponibilidad. [Descubrimiento local de skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).

El agente necesita en ese chat:

- Acceso a terminal y archivos del equipo Windows donde se ejecuta Tauri.
- Búsqueda e inspección de imágenes para identificar referencias y verificar nombres.
- Herramienta integrada de generación de imágenes y la guía `imagegen` disponible en ese entorno. Instalar una skill no añade esa herramienta ni sus permisos.

No copiar todo el perfil `.codex` de esta PC: el repositorio contiene las instrucciones necesarias del proyecto. Las conexiones, sesiones y herramientas se configuran en el otro entorno. Si una herramienta no está disponible, informar la parte bloqueada y conservar lo ya preparado; no pedir claves para cambiar silenciosamente a generación por API.

## 4. Estilos sin sobrescribir los existentes

El repositorio contiene en `references/production/horizontal.json` una instantánea limpia del estilo usado aquí: velocidad 1,04×, encuadre y texto «Fuente: Canal N». No tiene medios, rutas locales, cuenta de Google ni credenciales. Se aplica a contenido de Canal N; cambiar el crédito si la fuente es otra.

Los estilos personales del otro equipo permanecen donde estén. Para una prueba aislada del estilo compartido:

```powershell
$testData = Join-Path (Get-Location) '.local/reproduction-editor-data'
New-Item -ItemType Directory -Path (Join-Path $testData 'Preajustes') -Force | Out-Null
$testPreset = Join-Path $testData 'Preajustes/horizontal.json'
if (-not (Test-Path -LiteralPath $testPreset)) {
  Copy-Item -LiteralPath 'references/production/horizontal.json' -Destination $testPreset
}
node scripts/process-link.mjs --list-styles --orientation horizontal --data-dir $testData --executable $editorExecutable
```

Se reconoce como «Mi estilo» mediante la compatibilidad del formato anterior. Para trasladar estilos personales, copiar sus archivos de `Preajustes/` por una vía privada y comprobar orientación, nombre, textos y encuadre antes de reemplazar nada. `--data-dir` controla proyectos/estilos y `--downloads-dir` los originales; el MP4 va por defecto a `Videos/ediciones/` salvo `--output`.

## 5. Drive y credenciales

Drive es opcional para comprobar miniaturas y exportación local. Para entregar archivos, configurar el cliente OAuth de escritorio y autorizar en el otro equipo usando `scripts/authorize-drive.mjs --credentials RUTA_JSON`. Guardar el JSON bajo `.local/credentials/` y los valores reales en `.env`; no enviarlos por chat ni añadirlos a Git.

Se mantiene temporalmente el modo Pruebas por decisión del usuario; el acceso renovable de Drive caduca a los siete días desde el consentimiento. El paso a producción y una nueva autorización se harán después. Las credenciales no viajan en los commits. Consultar `SEGURIDAD.md` y la guía de producción.

## 6. Comprobar el resultado, no solo la instalación

Primero reproducir las dos miniaturas aprobadas siguiendo [PRUEBA_DE_REPRODUCCION.md](PRUEBA_DE_REPRODUCCION.md). Esa prueba no necesita Drive ni estilos personales y conserva todos los resultados en `.local/reproductions/`.

Después abrir Tauri con una carpeta aislada, importar un video corto y comprobar vista previa, guardado/reapertura, deshacer/rehacer y exportación. Confirmar «Mi estilo» con sus textos en la app real. Para la prueba del procesamiento completo, usar un enlace y una referencia de prueba explícitos con el ejecutable recién compilado; elegir `--data-dir`, `--downloads-dir` y `--output` para separar los archivos de prueba. Ese comando entregará a Drive si hay credenciales configuradas: para una prueba exclusivamente local, usar un clon aislado sin `.env` ni variables OAuth de Drive en su proceso. Cambiar solo `--data-dir` no desactiva la entrega.

Registrar sistema, commit, binarios, GPU/codificador, rutas efectivas y resultados. Cambios de GPU, fuentes, resolución disponible o modelo de imagen pueden producir diferencias: comparar la geometría y los criterios visuales, sin prometer identidad de píxeles. Una instalación que pasa los comandos todavía no demuestra una revisión visual favorable ni aprobación del usuario.

No se ha probado físicamente una segunda PC desde esta sesión. El otro agente deberá completar ese último tramo y guardar su informe; no debe marcarlo como realizado solo por leer esta guía.
