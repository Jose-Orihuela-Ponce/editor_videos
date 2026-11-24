# Flujo de producción: enlace, video, miniatura y título

Actualizado: 23 de noviembre de 2026.

## Componentes

- Editor manual para preparar estilos y ediciones particulares.
- `scripts/process-link.mjs`: descarga un video individual de YouTube y exporta el MP4 con el estilo guardado, usando una instancia oculta de Tauri.
- `src/production/` y `src-tauri/src/production/`: coordinación automática; comparten estilos, textos, geometría y exportación con el editor.
- `scripts/production/` y `scripts/upload-drive.mjs`: entrega y reintentos en Drive.
- Skill `crear-miniaturas`, con fuente en `skills/crear-miniaturas/`: fotogramas, elección del usuario y composición. Funciona por conversación, independiente del render del MP4.
- Skill `corregir-textos`, con fuente en `skills/corregir-textos/`: corrección del título propuesto. Las dos skills se habilitan por repositorio con `npm run skills:setup`.

## Trabajo nuevo

Pedir el nombre corto de referencia si falta. Identifica el trabajo y la subcarpeta de Drive; el texto de miniatura y el título de publicación se definen aparte.

```powershell
node scripts/process-link.mjs --paths
node scripts/process-link.mjs --list-styles --orientation horizontal
node scripts/process-link.mjs --url "https://youtu.be/ID_DEL_VIDEO" --style "Mi estilo" --reference "NOMBRE_CORTO" --orientation horizontal
```

Se requiere Windows con sesión disponible y una compilación Tauri actualizada con sus cuatro sidecars. La descarga prefiere 1080p, con alternativa 720p o la mejor inferior disponible; `--quality 720` cambia la preferencia. No aumenta artificialmente la resolución. Aplica una copia del estilo compartido y entrega el MP4. El nombre automático procede del video original.

`--output`, `--data-dir` y `--downloads-dir` configuran las carpetas; `--cpu` desactiva la aceleración. Consultar `--help` para el resto de opciones. Los registros `request.json`, `status.json`, `result.json` y `production.json` quedan en `Produccion/Trabajos/<id>/` bajo los datos efectivos. El original y `descarga.json` se conservan en descargas. Los MP4 van por defecto a `Videos/ediciones/`.

Ctrl+C solicita cancelación; se conservan originales completos y archivos previos. Desde otra terminal:

```powershell
node scripts/process-link.mjs --cancel "CARPETA_DEL_TRABAJO"
```

## Drive en modo Pruebas

Por decisión del usuario del 23 de noviembre, se mantiene temporalmente el modo Pruebas. El paso a producción lo realizará después. No se ha cambiado ni vuelto a comprobar el estado en Google Console.

Configurar OAuth de escritorio con Drive API y el permiso `drive.file`. Usar los nombres de `.env.example`; conservar valores reales solo en `.env`. Guardar el JSON descargado en `.local/credentials/`, excluido de Git, y autorizar en el navegador del mismo equipo:

```powershell
node scripts/authorize-drive.mjs --credentials ".local/credentials/desktop-client.json"
```

El helper guarda cliente, secreto y refresh token sin mostrar sus valores. No se requiere el plugin de Drive ni una sesión de Drive abierta para ejecutar subidas posteriores. El identificador de la carpeta Ediciones es opcional.

En una app externa en Pruebas, la autorización con permisos de Drive caduca a los siete días desde el consentimiento. Si deja de autorizar, repetir el helper y reintentar el trabajo existente. No regenerar el MP4 por un error de autorización. Cuando el usuario cambie a producción, volver a autorizar. [Regla de Google](https://developers.google.com/identity/protocols/oauth2#expiration).

El proceso intenta entregar el MP4 cuando las credenciales están completas. Sin ellas registra `pending_credentials`. La edición (`result.json`, estado `completed`) y la entrega (`drive.json`, estado `verified`) son independientes. Un fallo de Drive conserva el MP4 local. Los registros de Drive pueden contener una URL privada de sesión de subida: no publicarlos. Más detalles en [SEGURIDAD.md](SEGURIDAD.md).

## Entrega y reintentos

1. Comprobar el MP4 y subirlo a Drive. Verificar transferencia y disponibilidad de reproducción antes de entregar el enlace para revisión.
2. Explorar el original con la skill; proponer 3–4 fotogramas por participante y esperar una elección de cada grupo. En nuevas rondas conservar las elecciones solicitadas y usar IDs nuevos.
3. Recibir contexto, referencia visual y texto de miniatura. Pedir el texto si falta, corregirlo y buscar la imagen de referencia conservando la fuente. Componer y ajustar hasta aprobación.
4. Añadir la miniatura aprobada al mismo trabajo. La entrega es `Ediciones/<referencia>/video.mp4` y `miniatura.png` o JPG. Registros, capturas y prompts quedan locales.
5. Corregir el título de publicación propuesto y entregarlo listo para copiar.

Para reintentar solo la entrega o añadir la miniatura:

```powershell
node scripts/upload-drive.mjs --job "CARPETA_DEL_TRABAJO"
node scripts/upload-drive.mjs --job "CARPETA_DEL_TRABAJO" --thumbnail "RUTA_DE_MINIATURA_APROBADA.png"
```

Los reintentos conservan IDs, reanudan transferencias y evitan duplicados del mismo trabajo. Se comparan tamaño y MD5 antes de marcar `verified`. Un trabajo distinto con la misma referencia crea su propia subcarpeta. La reproducción puede tardar en estar disponible después de terminar la carga. Solo repetir edición si el defecto está en el contenido. No se publica en YouTube.

La exploración de miniaturas puede adelantarse durante la exportación cuando el agente la inicia, pero no existe integración en segundo plano con el ejecutor.

## Evidencias y mantenimiento

El 23 de noviembre se terminó una producción real con video y miniatura verificados en Drive; el usuario confirmó descarga al teléfono y aprobó el resultado. Las rutas y enlaces de ese trabajo permanecen locales. El resumen anterior se conserva en `.local/revision-github/flujo-antes.md`; los trabajos guardan su propio estado.

Se mantienen las pruebas de regresión del editor, producción y Drive. Ejecutar las comprobaciones del README antes de subir cambios. Las exportaciones automatizadas no sustituyen la revisión visual en Tauri y la aprobación del usuario.

Las muestras originales se conservan localmente y se excluyen de Git. Las dos referencias aprobadas, la configuración y el extractor reutilizable forman parte del código de la skill. No borrar datos de producción para limpiar el repositorio.
