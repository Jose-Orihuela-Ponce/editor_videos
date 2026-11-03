# Avance

Actualizado: 2 de noviembre de 2026.

## Estado

**Etapas 1 a 6 implementadas.** La etapa 7 del plan (subtítulos con Whisper) es futura y opcional. Instalador generado: `src-tauri/target/release/bundle/nsis/Editor_0.1.0_x64-setup.exe`; no se instaló en el equipo.

- Pantalla de inicio simplificada: se retiraron la franja «Biblioteca local» y el texto de bienvenida; «Abrir proyecto» permanece junto a «Nuevo proyecto». El instalador existente es anterior a este cambio.
- Panel del video organizado en apartados desplegables: escala y posición, espejo, recorte, velocidad y volumen; configuración del proyecto separada. El instalador existente aún no incluye estos cambios.
- Paneles de texto y audio organizados en apartados desplegables; también se ordenaron los controles compartidos de imagen y video superpuesto.
- GitHub: `origin` apunta a `https://github.com/Jose-Orihuela-Ponce/editor_videos.git`, rama `main`. Subidos el editor (`257585e`) y la preparación (`6055157`); push confirmado el 2 de noviembre. Incluye `.gitignore`, `.gitattributes`, workflow Windows y guía para compilar en otra PC con los mismos sidecars, y trasladar datos por separado. No se incluyen pruebas locales, binarios ni instaladores.
- Acceso directo `Escritorio/Editor de video.lnk` apunta a la compilación de escritorio actual en `src-tauri/target/release/`, junto a FFmpeg y FFprobe. Si se borra esa carpeta, hay que compilar y crear el acceso de nuevo; no es una instalación.

- Editor Tauri/React local en español, tema azul, horizontal 16:9 y vertical. Pistas simultáneas, texto Montserrat, imanes y guías, historial, respaldo, ajustes y exportación MP4/MP3. Exportación predeterminada: `C:/Users/freud/Videos/ediciones/`.
- Estilo conjunto por orientación: botones superiores para guardar/aplicar video y textos con contenido, formato, posición, tiempos, velocidad y volumen. Videos superpuestos no admiten aún todas las transformaciones de la pista principal. Consultar el plan y README para detalles.
- Pulido: aviso y botón Localizar para originales faltantes; comprueba tipo, duración y audio, preserva ediciones y admite deshacer/rehacer. Proxies H.264 en `Editor/cache/proxies/` para videos mayores a 1080p o fallo de vista previa; generación en segundo plano de uno en uno y exportación desde originales. Atajos y aviso de cambios sin guardar verificados; Espacio funciona con clip enfocado.
- Preajustes y proyectos en `Documentos/Editor/`; `EDITOR_DATA_DIR` permite aislar datos. Instalador usa WebView2 y puede necesitar red para instalarlo si falta.

## Comprobado

- Preparación GitHub (2 de noviembre): remoto consultado con `git ls-remote`; exclusiones verificadas y ningún archivo versionado coincide con ellas. Revisión de patrones comunes de credenciales sin hallazgos. Pasaron 44 pruebas de interfaz/exportación, 10 de Rust (persistencia incluida) y compilación web. Workflow pendiente de ejecutarse en GitHub al subirlo; no se recompiló el instalador ni se repitió la prueba visual nativa.
- `npm test`: 44 pruebas; `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib`: 10 pruebas; compilaciones web y Rust aprobadas.
- Tauri aislado: detectar un archivo faltante, relocalizar, guardar/reabrir y deshacer/rehacer; proxy H.264 con audio; video 2560×1440 reproduce mediante proxy y exporta desde el original. Un error de reproducción simulado generó proxy y permitió reproducir/exportar. Evidencias `.local/check-missing-ui-native.mjs`, `.local/check-stage6-native.mjs`, `.local/check-proxy-playback.mjs`, `.local/check-proxy-fallback.mjs`.
- Interfaz web: Espacio, dividir, deshacer/rehacer y aviso de cambios sin guardar (`.local/check-shortcuts.mjs`). Versión compilada de producción abrió la interfaz, detectó FFmpeg/FFprobe y generó proxy (`.local/check-release-stage6.mjs`). NSIS generado correctamente; no se ejecutó el instalador ni se verificó una instalación completa.

## Retomar aquí

Ver `README.md` y `Editor de video ligero plan del proyecto.md`. La vista web no accede al disco; pruebas con `EDITOR_DATA_DIR` y salida explícita dentro de `.local/`. Pendiente confirmar sentido de Y con el usuario y medir rendimiento largo/4K. El proyecto aún no copia automáticamente los originales a su carpeta.
