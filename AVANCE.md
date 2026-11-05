# Avance

Actualizado: 4 de noviembre de 2026.

## Estado

- Etapas 1–6 implementadas; Whisper (etapa 7) sigue futuro y opcional. Modo automático de YouTube autorizado e implementado.
- Aplicación instalada en `C:/Users/jose/AppData/Local/Programs/Editor/`; un único acceso `Escritorio/Editor de video.lnk` apunta allí. Ejecutable actualizado, respaldo en `.local/responsive-update/`; proyectos y estilos conservados.
- Ventana inicial 1000 × 620, mínimo 720 × 420, centrada y con `preventOverflow`. Inicio compacto, sin textos decorativos ni barra lateral grande. Formulario automático en filas. Editor horizontal/vertical ajustado al viewport; paneles y pistas se desplazan internamente.
- Modo automático: nombre de proyecto editable antes del trabajo, bloqueado durante el proceso; se usa también para el MP4. Vacío usa el título de YouTube. Carga el último estilo guardado del editor manual para la orientación elegida, incluidos ajustes y textos.
- Descarga: prefiere 1080p/720p; si no existen, elige la mejor inferior, sin agrandar. Originales en `Documentos/Editor/Automaticos/<id>/`; respeta `EDITOR_DATA_DIR`. Salida de ambos modos: `C:/Users/jose/Videos/ediciones/` por defecto.
- Velocidad con paso 0,01× (admite 1,04×). Estilo conjunto por orientación: velocidad, volumen, escala, posición, espejos, recorte y textos completos con formato y tiempos, limitados a la duración del destino. No representa un montaje completo ni todas las transformaciones de videos superpuestos.
- Editor manual con pistas simultáneas, historial, respaldo, relocalización, proxies de vista previa y exportación desde originales. Proyectos/preajustes en `Documentos/Editor/`; `EDITOR_DATA_DIR` permite pruebas aisladas.
- Dependencias incluidas: FFmpeg/FFprobe 9.0.2, yt-dlp 2026.10.26 y Node 22.12.0, con manifiestos/licencias. `npm run automatic:setup` prepara descargador y runtime.
- GitHub: `origin` = `https://github.com/Jose-Orihuela-Ponce/editor_videos.git`; rama `main`. Esta sesión agrupa las mejoras actuales y el arreglo de CI para commit/push autorizado por el usuario; base anterior `0f8c625`. Respaldo previo en stash `respaldo-local-antes-actualizar-2026-11-04`.

## Comprobado

- Publicación de este punto: preparación de sidecars validada, 51 pruebas JavaScript y 13 de Rust aprobadas, compilación web aprobada.
- GitHub Actions: workflow «Comprobaciones» añadido al preparar GitHub (`6055157`), automático con push a main. Las tres ejecuciones anteriores fallaron al copiar shims de Chocolatey (0 MB) como FFmpeg/FFprobe. Corregido para usar los ejecutables reales del paquete y validar la copia; checkout/setup-node actualizados a runtimes Node 24. Registro revisado: ejecución `41776307447`.

- Nombre/distribución: siete pruebas del modo automático y compilación web/release aprobadas. Navegador con API nativa simulada: 19 distribuciones entre 640 × 480 y 1280 × 720; incluye mínimo nativo 720 × 420, nombre del MP4, bloqueo durante proceso y estilo compartido. Evidencia: `.local/ui-check/output/results.json` y capturas.
- Tauri instalado real mediante CDP de WebView2: campo editable y estilo horizontal guardado disponibles, formulario dentro de viewport 1070 × 650. Ventana minimizada durante la comprobación final; no se validó posición física final. Evidencia: `.local/ui-check/output/native-result.json`. Prueba cerrada; aplicación reabierta normalmente sin modo diagnóstico.
- Ejecutable instalado verificado por SHA-256 (marcador NSIS `NSS`); dos archivos de datos conservaron hashes al actualizar. Un único acceso directo verificado. Evidencia: `.local/responsive-update/updated.json` y `final.json`.
- Descarga: enlace `8kteWHiD-J8` disponible hasta 854 × 470; nueva selección descargó muestra real de 5,021 s con imagen/audio. Pasaron 13 pruebas Rust con SD, HD recortado y vertical. Evidencia: `.local/download-debug/`.
- Verificaciones anteriores: 50 pruebas JavaScript, 13 Rust, persistencia del estilo completo a 1,04×, varios textos y deshacer/rehacer. Pruebas nativas detalladas de descarga/exportación/relocalización/proxies del equipo de origen están descritas en la documentación anterior; no confundirlas con esta instalación.

## Retomar aquí

- El instalador NSIS existente (161,27 MiB) es anterior a las correcciones de calidad inferior, nombre y distribución: regenerarlo antes de reinstalar. El ejecutable instalado sí está actualizado.
- Consultar README, plan y `Flujo automatico de enlace a video editado.md`. Fuera de alcance automático: otros proveedores, cuentas/cookies, lotes, scripts e historial persistente de trabajos.
- Pendiente confirmar sentido del eje Y y medir rendimiento largo/4K. El editor manual referencia originales; todavía no los copia al proyecto. Probar siempre Tauri para disco, con datos/salidas aislados en `.local/` cuando corresponda.
