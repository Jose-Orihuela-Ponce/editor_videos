# Editor

Editor local de video para Windows. Estado y siguiente paso: **[AVANCE.md](AVANCE.md)**. Alcance: [plan del proyecto](Editor%20de%20video%20ligero%20plan%20del%20proyecto.md).

Implementadas las etapas 1 (base), 2 (edición básica), 3 (transformaciones), 4 (capas), 5 (estilos) y 6 (pulido).

Para actualizar una PC que aún conserva Manual/Automático, seguir [INSTALACION_EN_OTRA_PC.md](INSTALACION_EN_OTRA_PC.md). Incluye las dos skills propias, preparación del entorno, una copia limpia de «Mi estilo» y la migración al ejecutable nuevo. [PRUEBA_DE_REPRODUCCION.md](PRUEBA_DE_REPRODUCCION.md) permite al otro agente repetir los ejemplos aprobados desde URLs, generar imágenes nuevas y documentar diferencias; los videos completos quedan fuera de Git.

## Repositorio y GitHub

Remoto `origin`: [Jose-Orihuela-Ponce/editor_videos](https://github.com/Jose-Orihuela-Ponce/editor_videos). Rama principal: `main`.

Para obtener el proyecto en otro equipo:

```powershell
git clone https://github.com/Jose-Orihuela-Ponce/editor_videos.git
cd editor_videos
```

Después sigue los requisitos y comandos de desarrollo de abajo. Git conserva ambos archivos de bloqueo y los recursos de la aplicación. El `.gitignore` excluye dependencias, compilaciones, instaladores, ejecutables de FFmpeg/FFprobe, pruebas locales en `.local/` y archivos `.env` privados. Guarda los medios de prueba y las exportaciones dentro de `.local/` si trabajas en el repositorio. No añadas credenciales ni archivos personales con `git add -f`.

Antes de preparar una subida, ejecuta `npm run check:secrets -- --history`. Revisa archivos publicables, el índice y el historial sin mostrar valores. Las muestras originales de `references/thumbnails/ejemplo_*/` y los archivos de video y audio quedan fuera de Git; las dos imágenes aprobadas de la skill sí se conservan. Consulta [SEGURIDAD.md](SEGURIDAD.md) para configurar Drive y revisar secretos.

GitHub Actions revisa secretos en archivos e historial y ejecuta pruebas de interfaz y exportación con FFmpeg, compilación web y pruebas de Rust en Windows. No usa credenciales de Drive ni genera o publica instaladores. Su resultado se comprueba después de subir el workflow; no sustituye las pruebas de la aplicación Tauri.

El código propio no tiene todavía una licencia de distribución declarada. Montserrat conserva su licencia en `public/fonts/OFL.txt`; antes de distribuir instaladores con FFmpeg, revisa también las condiciones de la compilación utilizada (la actual incluye componentes GPL).

## Abrir en desarrollo

Requisitos: Windows 10/11 x64, Node.js 22.12+ o 24+, Rust (destino `x86_64-pc-windows-msvc`) con herramientas de compilación C++ de Microsoft y Windows SDK, WebView2 y FFmpeg/FFprobe disponibles en el PATH. Las dependencias están fijadas en `package-lock.json` y `src-tauri/Cargo.lock`.

```powershell
npm ci
npm run sidecars
npm run automatic:setup
npm run skills:setup
npm run desktop
```

`sidecars` copia FFmpeg y FFprobe desde el PATH a `src-tauri/binaries/`, con los nombres exigidos por Tauri. También puedes indicar `FFMPEG_BIN` y `FFPROBE_BIN`. Deben señalar los ejecutables reales, no los lanzadores de Chocolatey/Scoop: se comprueba que la copia pueda ejecutarse. Se registra versión y SHA-256 en `SOURCES.json`; los ejecutables se excluyen de Git. En este equipo los binarios completos ocupan aproximadamente 434 MB en total.

Para conservar los mismos códecs que la versión local, utiliza la compilación completa de FFmpeg 9.0.2 de Gyan indicada en `src-tauri/binaries/SOURCES.json` (incluye libx264 y libmp3lame). Puedes copiar los dos ejecutables de `src-tauri/binaries/` de este equipo al mismo directorio del otro equipo; en ese caso no hace falta ejecutar `npm run sidecars`. Comprueba sus SHA-256 contra el manifiesto con `Get-FileHash -Algorithm SHA256`. La aceleración de exportación dependerá de la GPU y los controladores del otro equipo; existe respaldo por CPU.

Para una versión compilada, prepara las dependencias anteriores y ejecuta `npx tauri build --bundles nsis`. Instala el archivo generado en `src-tauri/target/release/bundle/nsis/`; incluye FFmpeg y FFprobe. El código descargado de GitHub requiere estos pasos de compilación: el repositorio no contiene un instalador listo para ejecutar.

Tus proyectos y estilos son independientes del código: para trasladarlos, copia tu carpeta de datos efectiva (consulta `node scripts/process-link.mjs --paths`) y los medios originales al otro equipo. Si cambian las rutas, usa **Localizar** y vuelve a guardar. Copia también tus exportaciones si las necesitas; GitHub no almacena esos datos personales.

## Instalador de Windows

Compila desde el código actual antes de distribuir un instalador o utilizar el procesamiento por comando en otro equipo. Conserva los argumentos `--data-dir` y `--downloads-dir` de tus accesos directos si usan rutas personalizadas. Si falta WebView2, el instalador puede necesitar conexión para obtenerlo.

Para volver a generarlo en Windows con las dependencias preparadas:

```powershell
npx tauri build --bundles nsis
```

## Editor manual y flujo de producción

La aplicación del escritorio abre el editor manual para crear proyectos, editar y guardar estilos. El procesamiento por enlace se inicia desde el chat o por comando y reutiliza el motor de edición. El código del flujo está en `src/production/` y `src-tauri/src/production/`. Los estilos y sus reglas compartidas están en `src/core/styles.ts`; el estado de la interfaz está en `src/core/presets.ts`.

El flujo descarga un video de YouTube, aplica el estilo guardado y exporta un MP4. Admite 1080p con alternativa 720p, preferencia 720p o la mejor resolución inferior disponible, conservando sus dimensiones. Los originales se conservan en `Videos/ediciones/descargas/<id>/`, con `descarga.json`; las rutas se pueden configurar. Al cancelar se limpian los parciales y se conserva un original completo.

`npm run automatic:setup` prepara yt-dlp y Node.js como sidecars, con sus licencias. Ejecuta este paso antes de compilar. Para actualizar el soporte de YouTube, vuelve a preparar las dependencias y recompila.

## Procesar desde un enlace por comando

El flujo de producción admite trabajos iniciados desde el chat o la terminal. El script abre una instancia oculta de Tauri, prepara los textos con WebView2, descarga y exporta el MP4. Cada instancia tiene un perfil WebView2 propio. Se requiere Windows con sesión disponible y la compilación actualizada del editor con sus cuatro sidecars.

Para consultar los estilos de la carpeta de datos habitual:

```powershell
node scripts/process-link.mjs --list-styles --orientation horizontal
```

Para procesar un enlace con un estilo guardado:

```powershell
node scripts/process-link.mjs --url "https://youtu.be/ID_DEL_VIDEO" --style "Mi estilo" --reference "Keiko Fujimori" --orientation horizontal
```

El estilo se elige por nombre exacto o identificador y se lee de la misma carpeta de datos que utiliza el editor. Esta primera fase descarga el video, aplica los ajustes y textos guardados en el estilo y entrega el MP4. El archivo recibe un nombre automático basado en el video original. El texto de miniatura y el título de publicación pertenecen a fases posteriores. `--quality 720` cambia la preferencia de descarga y `--cpu` desactiva la aceleración. `--output`, `--data-dir` y `--downloads-dir` permiten indicar carpetas. Se respetan también `EDITOR_DATA_DIR` y `EDITOR_DOWNLOAD_DIR`. `--executable` selecciona una compilación instalada en otra ruta. Sin ese argumento, el script busca la compilación local y prioriza `editor-video-ligero-automatico.exe`.

Cada ejecución escribe `request.json`, `status.json` y `result.json` en `Produccion/Trabajos/<id>/` bajo la carpeta de datos del editor. La instancia oculta guarda su perfil WebView2 dentro de esa carpeta de trabajo. El script informa la carpeta y el progreso en stderr y entrega un JSON final en stdout. El resultado incluye la ruta del MP4, la del original y el estilo utilizado. El MP4 se guarda por defecto en la misma carpeta del editor manual, `Videos/ediciones/`. El módulo de Drive recibe ese archivo terminado; queda pendiente de credenciales hasta configurar el acceso. Los códigos de salida son 0 para completado, 1 para error y 2 para cancelado. El resultado se conserva para consultarlo al volver al chat.

Para consultar las carpetas efectivas, incluidas las rutas personalizadas:

```powershell
node scripts/process-link.mjs --paths
```

Ctrl+C solicita cancelación y espera la limpieza. Desde otra terminal también se puede usar:

```powershell
node scripts/process-link.mjs --cancel "RUTA_DE_LA_CARPETA_DEL_TRABAJO"
```

## Entrega en Google Drive

Al iniciar un trabajo desde el chat, se pide el nombre corto de referencia si aún falta. `--reference` guarda ese dato por separado del texto de miniatura y del título de publicación. El flujo utilizará esta organización:

```text
Ediciones/
  Keiko Fujimori/
    video.mp4
    miniatura.png
```

Cada trabajo tiene su propia subcarpeta. Si se repite el nombre en un trabajo distinto, se crea otra subcarpeta con ese nombre. Los registros JSON se guardan en el equipo. El título corregido se entrega en el chat.

Las credenciales locales de acceso se guardan en `.env`, que está excluido de Git. `.env.example` conserva la plantilla:

```dotenv
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_EDICIONES_FOLDER_ID=
```

Se utiliza OAuth de una aplicación de escritorio con Drive API habilitada. Descarga su JSON dentro de `.local/credentials/` y ejecuta:

```powershell
node scripts/authorize-drive.mjs --credentials ".local/credentials/desktop-client.json"
```

El helper importa el cliente, solicita acceso sin conexión con el permiso `https://www.googleapis.com/auth/drive.file` y guarda la autorización en `.env`. Completa personalmente el consentimiento en el navegador del mismo equipo. No compartas el JSON, `.env` ni la URL temporal de autorización. El identificador de Ediciones es opcional y permite elegir una carpeta ya accesible para esa autorización. Si queda vacío, el módulo encuentra o crea Ediciones en Mi unidad. [Autorización de aplicaciones de escritorio](https://developers.google.com/identity/protocols/oauth2/native-app).

Cuando los tres valores de acceso están completos, el comando de procesamiento ejecuta la entrega tras generar el MP4. Si faltan, conserva el video local y registra `drive.state = pending_credentials`. El estado superior del resultado corresponde a la edición, y el campo `drive` indica el estado de la entrega. La conexión real, la carga del MP4 y la miniatura, y la descarga móvil se validaron el 23 de noviembre de 2026.

**Decisión del 23 de noviembre: continuar temporalmente en modo Pruebas.** En una app externa con acceso a Drive, el refresh token de ese modo caduca a los siete días desde el consentimiento. Reautoriza con el helper y reintenta la subida del trabajo existente; el MP4 se conserva. El usuario pasará a producción más adelante y volverá a autorizar. El estado de Google Console aún no se ha vuelto a comprobar. [Caducidad de tokens](https://developers.google.com/identity/protocols/oauth2#expiration).

Para reintentar la entrega del mismo trabajo:

```powershell
node scripts/upload-drive.mjs --job "CARPETA_DEL_TRABAJO"
```

Para añadir posteriormente la miniatura:

```powershell
node scripts/upload-drive.mjs --job "CARPETA_DEL_TRABAJO" --thumbnail "C:/ruta/miniatura.png"
```

La subida conserva los identificadores de carpeta y archivos, permite reanudar transferencias interrumpidas y verifica tamaño y MD5 contra el archivo local antes de marcar `verified`. Los reintentos actualizan los archivos del mismo trabajo. La disponibilidad de la reproducción de video en Drive puede requerir procesamiento adicional. Ctrl+C solicita cancelar la transferencia. [Cargas reanudables](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## Corrección de títulos

La skill `corregir-textos`, incluida en `skills/corregir-textos/`, corrige ortografía, gramática, sintaxis y puntuación. `npm run skills:setup` la habilita junto con `crear-miniaturas` en el repositorio del otro equipo; `skills:check` detecta copias pendientes de actualizar. En títulos de actualidad política toma el contexto peruano y verifica grafías dudosas de figuras públicas. Entrega directamente el texto corregido, respetando la idea y redacción del usuario.

## Miniaturas y prueba real

La skill personal `crear-miniaturas`, con fuente en `skills/crear-miniaturas/`, explora el original, propone capturas con IDs y tiempos, admite nuevas rondas y compone con el texto y las referencias del usuario. Contiene dos diseños aprobados y un extractor reutilizable. Funciona por conversación, independiente del render del MP4.

La prueba real completó MP4 editado, miniatura aprobada y título corregido; ambos archivos se subieron a Drive y el usuario confirmó la descarga al teléfono y aprobó el resultado. La [guía de producción](Flujo%20automatico%20de%20enlace%20a%20video%20editado.md) explica cómo operar y reintentar; las rutas, identificadores y enlaces de entregas reales permanecen en registros locales excluidos de Git.

## Almacenamiento

Por defecto se usan estas ubicaciones:

- Proyectos y estilos compartidos en `Documentos/Editor/Proyectos/` y `Documentos/Editor/Preajustes/`.
- Registros de producción en `Documentos/Editor/Produccion/Trabajos/<id>/`.
- MP4 terminados en `Videos/ediciones/`, tanto en edición manual como automática.
- Originales descargados en `Videos/ediciones/descargas/<id>/`.
- Caché de medios del editor en `Documentos/Editor/cache/`.

`--data-dir` o `EDITOR_DATA_DIR` configuran la carpeta de datos para ambos modos. Los accesos directos con rutas personalizadas deben conservar sus argumentos. `--downloads-dir` o `EDITOR_DOWNLOAD_DIR` configuran los originales. El destino final se puede elegir al exportar manualmente o con `--output` en producción.

Un proyecto nuevo queda en memoria hasta guardar. Su carpeta contiene `proyecto.json` y la copia `.bak`. Los medios se referencian por ruta. La aplicación permite localizar archivos movidos.

Para una prueba aislada:

```powershell
$env:EDITOR_DATA_DIR = Join-Path (Get-Location) '.local/demo-data'
node scripts/process-link.mjs --paths
```

En ese caso, las descargas quedan bajo los datos aislados. Para aislar también el MP4, usa `--output` con una carpeta de prueba. Las carpetas reales pueden consultarse con `--paths`.

## Archivos movidos y atajos

Si un original falta al abrir un proyecto, el panel **Medios** muestra el nombre y el botón **Localizar**. Elige el archivo correspondiente y guarda el proyecto para conservar la nueva ruta. El editor mantiene los cortes y ajustes, y rechaza archivos de otro tipo o demasiado cortos para los cortes usados. El cambio se puede deshacer y rehacer.

Espacio reproduce o pausa; S divide; Supr elimina; Ctrl+S guarda; Ctrl+Z y Ctrl+Shift+Z deshacen y rehacen. Las flechas mueven el elemento seleccionado (Mayús mueve más); coma y punto avanzan fotograma a fotograma; Ctrl y rueda cambian el zoom de la línea de tiempo. Ctrl+Alt+C y Ctrl+Alt+V copian y pegan ajustes. Al volver al inicio o cerrar con cambios pendientes aparece un aviso.

## Estilos

Selecciona un video de la pista principal y pulsa **Guardar estilo** en la barra superior. Se guardan sus ajustes de encuadre, velocidad y volumen, y los textos que aparecen durante ese video: palabras, formato, posición, escala y tiempo. Elige **Nuevo estilo** y escribe un nombre, o selecciona un estilo existente para reemplazarlo. Cada orientación tiene su propia lista. También puedes guardar mientras está seleccionado un texto que aparece sobre el video.

Selecciona otro video, pulsa **Aplicar estilo** y elige el estilo guardado. Se aplican los ajustes del video y se añaden copias de los textos, sin eliminar los que ya había. Los textos que excedan el final del video se recortan en la nueva copia; si se selecciona un texto, se aplica a ese texto el contenido, formato y posición del primer texto guardado. La operación se puede deshacer y rehacer. Los cortes del video seleccionado se conservan.

**Restablecer**, **Copiar** y **Pegar** siguen disponibles en el panel del clip o texto. Los estilos se guardan en `Preajustes/horizontal.styles.json` y `Preajustes/vertical.styles.json` bajo la carpeta de datos configurada. Los estilos anteriores aparecen como **Mi estilo**. Los videos superpuestos no admiten todos los ajustes del video principal y no pueden recibir el estilo completo.

## Comprobar

```powershell
npm run check:secrets -- --history
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Puedes añadir `--offline` a Cargo cuando las dependencias ya estén descargadas. La compilación de TypeScript rechaza variables y parámetros sin uso.

Las incidencias conocidas pendientes de revisión manual están en `AVANCE.md`. Esta preparación para GitHub no equivale a una nueva validación visual en Tauri ni a un instalador recién compilado.

`npm run dev` solo muestra la interfaz en un navegador: **no tiene acceso a los proyectos del disco**. Usa `npm run desktop` para importar, reproducir, guardar y exportar.

## Edición básica (etapa 2)

- **Agregar archivos** analiza los videos, crea miniaturas y los añade al final de la pista principal. Una tarjeta de Medios permite añadir otra instancia del mismo original.
- **Espacio** reproduce/pausa; el campo bajo la vista previa busca por segundos; coma/punto avanzan un fotograma del cabezal.
- **S** divide bajo el cabezal. **Supr** o la papelera elimina el clip seleccionado. Con unión automática se cierra el hueco; **Ctrl+Z / Ctrl+Shift+Z** deshacen/rehacen.
- Arrastrar un clip o usar las flechas de Propiedades cambia su orden. Para quitar un tramo, coloca el cabezal, divide con las tijeras y elimina el fragmento. En modo libre, el campo Inicio permite dejar huecos sin solapamientos.
- El mismo deslizador de **zoom** permite acercar o alejar hasta contraer todo el montaje un 20% más allá del encaje, adaptándose a su duración y al ancho disponible. **Ctrl + rueda del mouse** sobre la línea de tiempo cambia el zoom alrededor del cursor. No modifica el proyecto ni el historial.
- **Exportar** genera MP4 (H.264/AAC) o MP3, con Original/480p/720p/1080p para video. Los FPS siguen el primer clip. Hardware disponible mediante prueba real; reintento por CPU si falla el codificador. Cancelar elimina el parcial; nunca se reemplaza un archivo existente.

La vista previa usa WebView2: MP4 con H.264/AAC es el formato de referencia. Si un video supera 1080p o no se reproduce, se prepara un proxy H.264 hasta 720p para la vista previa; la exportación sigue usando el original. Los proxies se generan en segundo plano, uno a la vez, y quedan en `Editor/cache/proxies/`. Si no se puede generar el proxy, se muestra el error de reproducción.

## Transformaciones (etapa 3)

Selecciona un clip en la línea de tiempo o en la vista previa para mostrar sus controles en apartados desplegables: **Escala y posición**, **Espejo**, **Recorte de imagen**, **Velocidad** y **Volumen**. La configuración del proyecto está en un apartado separado. Los botones junto a las tijeras permiten activar los espejos, editar el recorte o enfocar velocidad y volumen. El tema oscuro usa acentos azules y el borde claro de la previsualización delimita el lienzo. La distribución vertical conserva la vista previa a toda altura a la derecha y ambos lienzos mantienen su proporción al redimensionar la ventana.

- **Escala uniforme** está activada inicialmente. El control Escala cambia ambos ejes a la vez; al desmarcarla aparecen **Ancho** y **Alto** independientes. Los porcentajes se muestran y ajustan sin decimales. Cambiar la casilla conserva exactamente el encuadre actual y no crea una edición. Cada eje admite una escala efectiva entre **10% y 1000%** respecto al tamaño encajado. Si la imagen ya está deformada, la escala uniforme conserva esa proporción actual.
- **Mover con el mouse**: arrastra directamente la imagen en la vista previa. Se selecciona el clip visible, se pausa la reproducción y X/Y se actualizan mientras mueves el mouse. Al acercarte al centro aparecen guías y el clip se engancha al centro de cada eje; al alejar el mouse se libera. Mantén **Alt** para mover sin imán. Las guías desaparecen al soltar y no aparecen en la exportación. Todo el arrastre se deshace o rehace como una acción. Funciona también con recorte, espejos y escala aplicados; durante el modo de recorte el recuadro conserva su función de recortar.
- **Posición X/Y** se mide en píxeles del lienzo desde el centro. X positivo mueve a la derecha; **Y positivo mueve hacia abajo**. Las flechas del teclado mueven el clip seleccionado 1 píxel; con **Mayús**, 10. Los campos numéricos conservan su uso normal del teclado. El desplazamiento máximo es dos anchos o dos altos del lienzo.
- **Espejo horizontal/vertical** actúa después del recorte del original.
- **Recorte de imagen**: pulsa **Editar sobre la vista previa** para mostrar el original completo. Arrastra las esquinas del recuadro para cambiar el área o arrastra su interior para moverla. **Terminar recorte** vuelve al resultado, con el recorte encajado, los espejos, la escala y la posición aplicados. Los campos Izquierda/Arriba/Ancho/Alto son porcentajes del original; el área debe conservar al menos 2 píxeles de ancho y alto. El recorte de imagen es independiente de cortar la duración con tijeras.
- **Velocidad** admite **0,25× a 4×** con pasos de **0,01×** (por ejemplo, **1,04×**), conservando el tono del audio. Con unión automática, los siguientes clips se desplazan al cambiar la duración. En modo libre se conserva su posición; si el cambio causa un solapamiento, se rechaza completo y se mantiene el valor anterior.
- **Volumen** admite **0% a 200%** mediante Web Audio. Sobre **150%** aparece un aviso de posible distorsión. La vista previa usa un compresor de salida; la exportación aplica un limitador final. Ambos protegen los picos con motores de audio distintos.

Los ajustes se guardan en el proyecto y se conservan al dividir un clip. Cada gesto del deslizador, campo o recuadro se puede deshacer/rehacer como una acción. La exportación MP4 aplica el mismo orden de geometría que la vista previa; MP3 usa únicamente los ajustes de audio y velocidad. Lo que sale del lienzo se corta y el fondo es negro. No hay rotación.

Las herramientas se registran en `src/tools/index.tsx`; cada módulo contiene sus controles y sus funciones de vista previa/exportación. El cálculo de encuadre compartido está en `src/core/geometry.ts`.

## Capas (etapa 4)

- **Agregar archivos** admite videos, imágenes y audio. Los videos se agregan a la pista principal; el botón de capas de su tarjeta en **Medios** añade otra instancia como video superpuesto. Las imágenes y el audio se colocan en pistas adicionales en la posición del cabezal. El botón **Agregar texto** está en la barra de la línea de tiempo.
- Se pueden superponer varios videos, imágenes, textos y audios. Arrastra cada elemento en la línea de tiempo para cambiar su inicio o pista; si se solapa con otro, se asigna una pista libre. Arrastra el borde derecho de un texto o imagen para cambiar su duración. Desplázate verticalmente por la línea de tiempo para ver todas las pistas. Selecciona un elemento para cambiar sus propiedades; tijeras, borrar y deshacer/rehacer también funcionan con capas.
- Los textos permiten cambiar contenido, letra, tamaño, color, fondo y su opacidad, negrita, cursiva, subrayado, opacidad general y alineación. El fondo se activa o desactiva con una casilla y conserva sus ajustes. Los textos nuevos usan Montserrat y fondo negro al 50%; la fuente se incluye localmente con su licencia SIL OFL. Las capas visuales admiten escala y posición, incluso arrastrándolas en la vista previa con guías e imán al centro. Para texto, los deslizadores de tamaño y escala también se enganchan al borde visible del video principal; **Ajustar al video** centra y ajusta el texto. Una casilla activa el fondo y conserva su color y transparencia. Los videos y audios adicionales permiten cambiar velocidad y volumen.
- Al seleccionar texto, el panel agrupa contenido, letra y formato, fondo, tiempo y pista, y escala y posición. En audio agrupa tiempo y pista, y velocidad y volumen. Las imágenes y videos superpuestos comparten los apartados que les corresponden.
- La salida termina al finalizar la pista principal. Las capas o audios que se extienden más allá permanecen completos en el proyecto, aunque esa parte no se exporta. Sin video principal, la duración se determina por el último elemento. Los audios simultáneos se mezclan y pasan por la protección de picos de salida.

Para generar dos videos sintéticos con distinto formato/FPS (uno sin audio):

```powershell
npm run test:media
```

Quedan en `.local/fixtures/`. `npm test` incluye exportaciones reales con FFmpeg que comparan encuadre, transformaciones, capas simultáneas, mezcla, limitación de picos y duración. También verifica historial, serialización, reproducción y rutas de Web Audio. Las pruebas de exportación se omiten si faltan los sidecars. Las pruebas de Rust verifican persistencia, recuperación, cancelación de un proceso real y reintento por CPU sin sobrescribir archivos.

Para probar la etapa 3 en la aplicación Tauri, usa la carpeta de datos aislada, importa los videos sintéticos y selecciona un clip. Cambia escala uniforme e independiente, X/Y, espejos, recorte, velocidad y volumen; prueba deshacer/rehacer y repite en horizontal y vertical. Guarda, vuelve al inicio y reabre para comprobar que los ajustes persisten. Exporta un MP4 y compara el resultado con la vista previa fuera del modo de recorte. Esta prueba nativa es distinta de abrir la interfaz con `npm run dev`.
