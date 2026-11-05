# Avance

Actualizado: 5 de noviembre de 2026.

## Estado

- Etapas 1–6 y modo automático de YouTube implementados. Whisper (etapa 7) sigue futuro y opcional.
- App instalada en `C:/Users/jose/AppData/Local/Programs/Editor/`; un único acceso de escritorio conserva `--data-dir` y `--downloads-dir` (también en Inicio). Sin rutas explícitas, otras instalaciones usan Documentos/Editor por compatibilidad.
- Datos, proyecto, estilos, caché y preferencias: `C:/Users/jose/Desktop/workspace/editor_videos/datos/`, excluido de Git. Perfil WebView2: `datos/WebView/EBWebView/`. Migración completada; ya no se usa Documentos/Editor en este equipo.
- Originales anteriores y nuevos: `C:/Users/jose/Videos/ediciones/descargas/<id>/original.mkv`, con `descarga.json`. MP4 finales: `C:/Users/jose/Videos/ediciones/` o la carpeta elegida.
- «Procesar otro» tras éxito limpia enlace, nombre y resultados/avisos, enfoca el enlace y conserva opciones y archivos; no inicia una descarga. Fallo/cancelación permiten reintentar con «Procesar».
- Nombre automático editable antes y bloqueado durante el trabajo; vacío usa título de YouTube. Usa el último estilo manual de la orientación elegida, con ajustes y textos completos. Velocidad admite 1,04× con paso 0,01×.
- Descarga prefiere 1080p/720p y permite la mejor inferior sin agrandar. Cancelar descarga limpia solo el trabajo incompleto; el original completo se conserva aunque se cancele exportación.
- Inicio/formulario compactos y editor con desplazamiento interno. Ventana inicial 1000 × 620, mínimo 720 × 420, centrada y ajustada al área de trabajo.
- Dependencias incluidas: FFmpeg/FFprobe 9.0.2, yt-dlp 2026.10.26, Node 22.12.0. Ejecutables y datos privados excluidos de Git.
- GitHub: `https://github.com/Jose-Orihuela-Ponce/editor_videos.git`, rama `main`. Publicación solicitada de las rutas, «Procesar otro» y limpieza; punto anterior `01dd434`.

## Comprobado

- Limpieza: 24 selectores CSS de pantallas retiradas, estado/API de preajustes sin llamadas e importación Rust no usada eliminados. Temporales, instaladores, muestras y scripts de tareas finalizadas retirados: 1081,2 MiB; ocho archivos de proyectos/estilos/descargas conservaron SHA-256. Evidencias pequeñas en `.local/evidencias/`; se retiraron los respaldos binarios obsoletos.
- Verificación final: 51 pruebas JavaScript, 16 Rust, compilación web y 19 distribuciones de interfaz aprobadas. Incluye persistencia, historial, cancelación que conserva archivos existentes y flujo «Procesar otro». Evidencia `.local/evidencias/interfaz.json`.
- Migración nativa anterior comprobada en Tauri: proyecto abre, estilo coincide, preferencias conservadas y tres originales localizables; perfil de 311 archivos trasladado con huellas verificadas. Evidencias `.local/evidencias/migracion/`.
- Workflow de GitHub corregido en `01dd434`: usa FFmpeg real en vez de shims de Chocolatey. Su ejecución `41966889341` terminó correctamente.

## Retomar aquí

- El instalador NSIS desactualizado se eliminó. Generar uno nuevo con `npx tauri build --bundles nsis` y conservar argumentos de rutas al reinstalar. El ejecutable instalado funciona con la configuración nueva.
- No publicar `datos/` ni `.local/`; al trasladar a otro equipo copiar datos aparte y ajustar rutas. Variables `EDITOR_DATA_DIR`/`EDITOR_DOWNLOAD_DIR` aíslan las pruebas, incluido WebView2.
- Ver README y plan. Pendientes: sentido del eje Y y rendimiento largo/4K; manual referencia originales sin copiarlos automáticamente. Fuera del modo automático: otros proveedores, cuentas/cookies, lotes e historial persistente de trabajos.
