# Avance

Actualizado: 3 de noviembre de 2026.

## Estado

- Etapas 1–6 implementadas. La etapa 7 (Whisper local) sigue futura y opcional.
- Ampliación autorizada: **Modo automático** en el inicio, junto al editor manual. Solo videos individuales de YouTube: enlace → descarga 1080p con alternativa 720p, o solo 720p → estilo guardado por orientación → exportación MP4. Comparte aplicación de estilos, textos canvas y exportación; no abre la línea de tiempo ni modifica el proyecto manual.
- Pantalla con el estilo azul del editor y controles ordenados, sin explicaciones adicionales. Progreso, cancelación y mostrar resultado en carpeta. Recuerda orientación, calidad y carpeta en el almacenamiento local de la interfaz.
- Descargas originales en `Documentos/Editor/Automaticos/<id>/`, con `descarga.json`; respeta `EDITOR_DATA_DIR`. Cancela y limpia descargas incompletas; conserva originales completos. Exportación predeterminada: `Videos/ediciones/`.
- Estilos en `Documentos/Editor/Preajustes/`, independientes por orientación. Guardan encuadre, velocidad, volumen y textos con contenido y tiempos relativos. Los videos superpuestos conservan sus limitaciones anteriores.
- Dependencias del modo automático: yt-dlp y Node incluidos como sidecars, con licencias y manifiesto SHA-256. Preparación: `npm run automatic:setup`; luego compilar. FFmpeg/FFprobe siguen incluidos. Ver README y plan.
- Editor manual: paneles desplegables, pistas simultáneas, historial, respaldo, relocalización, proxies solo para vista previa, MP4/MP3 y aviso de cambios sin guardar.
- Ejecutable de escritorio e instalador regenerados con el modo automático. El acceso directo `Escritorio/Editor de video.lnk` apunta a `src-tauri/target/release/`; no es una instalación. Instalador: `src-tauri/target/release/bundle/nsis/Editor_0.1.0_x64-setup.exe` (153.14 MiB); no se instaló en el equipo.
- GitHub: `origin` = `https://github.com/Jose-Orihuela-Ponce/editor_videos.git`, rama `main`. Punto de retorno previo al modo automático: commit `93f2a40`. Commit y publicación del modo automático autorizados por el usuario.

## Comprobado

- 48 pruebas de TypeScript y 13 de Rust aprobadas; compilación web y ejecutable de escritorio aprobados. Incluyen persistencia, historial, exportación real y selección offline con yt-dlp de 1080p, alternativa 720p, vertical, fuente sin audio y error si no hay calidad admitida.
- Tauri real, datos aislados: guardar/recargar estilo, rechazar enlaces externos, cancelar descarga con limpieza y procesar un enlace real de YouTube a 720p. Original de 634.624 s → MP4 de 158.656 s con velocidad 4, encuadre, volumen y textos. Los fotogramas comparados coinciden con la exportación manual del mismo original. Evidencia: `.local/check-automatic-native.mjs`, `.local/automatic-native/result.json` y capturas.
- Verificaciones anteriores de Tauri: relocalizar y guardar/reabrir con deshacer/rehacer; proxies H.264 para 1440p y error de reproducción; exportación desde originales. Evidencias `.local/check-stage6-native.mjs`, `.local/check-proxy-playback.mjs` y `.local/check-proxy-fallback.mjs`.
- Distribución comprobada en Tauri real: detecta sus cuatro sidecars, carga el estilo guardado, conserva calidad tras recargar y bloquea Procesar si falta el estilo de la orientación elegida. Evidencia: `.local/check-automatic-release.mjs`, `.local/automatic-release/result.json` y captura. NSIS generado; no se ejecutó el instalador ni se verificó una instalación completa. Ventanas de prueba cerradas.

## Retomar aquí

Consultar README, plan y `Flujo automatico de enlace a video editado.md`. Fuera del modo automático actual: otros proveedores, cuentas/cookies, lotes, ejecución por script e historial persistente de trabajos. La vista web no accede al disco; comprobar Tauri con `EDITOR_DATA_DIR` y salida explícita dentro de `.local/`.

Pendientes anteriores: confirmar sentido de Y con el usuario y medir rendimiento largo/4K. El editor manual todavía referencia los originales y no los copia automáticamente al proyecto.
