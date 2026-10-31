# Editor

Editor local de video para Windows. Estado y siguiente paso: **[AVANCE.md](AVANCE.md)**. Alcance: [plan del proyecto](Editor%20de%20video%20ligero%20plan%20del%20proyecto.md).

Implementadas las etapas 1 (base), 2 (edición básica), 3 (transformaciones), 4 (capas), 5 (estilos) y 6 (pulido).

## Abrir en desarrollo

Requisitos: Windows x64, Node.js 22.12+ o 24+, Rust con herramientas de compilación C++ de Microsoft y WebView2. Las dependencias están fijadas en `package-lock.json` y `src-tauri/Cargo.lock`.

```powershell
npm ci
npm run sidecars
npm run desktop
```

`sidecars` copia FFmpeg y FFprobe desde el PATH a `src-tauri/binaries/`, con los nombres exigidos por Tauri. También puedes indicar `FFMPEG_BIN` y `FFPROBE_BIN`. Se registra versión y SHA-256 en `SOURCES.json`; los ejecutables se excluyen de Git. En este equipo los binarios completos ocupan aproximadamente 402 MB en total.

## Instalador de Windows

Hay un instalador NSIS anterior en `src-tauri/target/release/bundle/nsis/Editor_0.1.0_x64-setup.exe`. No incluye los últimos cambios de interfaz y todavía no se ha comprobado una instalación completa. Regénéralo para incorporar el estado actual. La compilación incluye FFmpeg y FFprobe; si falta WebView2, el instalador puede necesitar conexión para obtenerlo.

Para volver a generarlo en Windows con las dependencias preparadas:

```powershell
npx tauri build --bundles nsis
```

## Datos

Por defecto: `Documentos/Editor/Proyectos/`. Un proyecto nuevo queda en memoria hasta pulsar **Guardar** o **Ctrl+S**. Cada carpeta contiene `proyecto.json`, su copia anterior `.bak` y `cache/`. Los medios originales se referencian por ruta; no se copian ni modifican. Las miniaturas regenerables se guardan en `Editor/cache/media/`, también para proyectos aún sin guardar.

Para una prueba aislada, en la misma terminal antes de iniciar:

```powershell
$env:EDITOR_DATA_DIR = Join-Path (Get-Location) '.local/demo-data'
npm run desktop
```

Para volver a la carpeta normal, abre otra terminal o ejecuta `Remove-Item Env:EDITOR_DATA_DIR`.

Las exportaciones van por defecto a **`C:\Users\freud\Videos\ediciones`** (Videos/ediciones del usuario). La ventana de exportación muestra la ruta completa y permite elegir otra carpeta. `EDITOR_DATA_DIR` cambia los datos del proyecto, no este destino; en pruebas aisladas elige explícitamente una carpeta de salida dentro de `.local/`.

## Archivos movidos y atajos

Si un original falta al abrir un proyecto, el panel **Medios** muestra el nombre y el botón **Localizar**. Elige el archivo correspondiente y guarda el proyecto para conservar la nueva ruta. El editor mantiene los cortes y ajustes, y rechaza archivos de otro tipo o demasiado cortos para los cortes usados. El cambio se puede deshacer y rehacer.

Espacio reproduce o pausa; S divide; Supr elimina; Ctrl+S guarda; Ctrl+Z y Ctrl+Shift+Z deshacen y rehacen. Las flechas mueven el elemento seleccionado (Mayús mueve más); coma y punto avanzan fotograma a fotograma; Ctrl y rueda cambian el zoom de la línea de tiempo. Ctrl+Alt+C y Ctrl+Alt+V copian y pegan ajustes. Al volver al inicio o cerrar con cambios pendientes aparece un aviso.

## Estilos

Selecciona un video de la pista principal y pulsa **Guardar estilo** en la barra superior. Se guardan sus ajustes de encuadre, velocidad y volumen, y los textos que aparecen durante ese video: palabras, formato, posición, escala y tiempo. Cada orientación tiene su propio estilo. También puedes guardar mientras está seleccionado un texto que aparece sobre el video.

Selecciona otro video y pulsa **Aplicar estilo**: se aplican los ajustes del video y se añaden copias de los textos, sin eliminar los que ya había. Los textos que excedan el final del video se recortan en la nueva copia; si se selecciona un texto, se aplica a ese texto el contenido, formato y posición del primer texto guardado. La operación se puede deshacer y rehacer. Los cortes del video seleccionado se conservan.

**Restablecer**, **Copiar** y **Pegar** siguen disponibles en el panel del clip o texto. Los estilos se guardan en `Documentos/Editor/Preajustes/horizontal.json` y `vertical.json`, o en la carpeta de `EDITOR_DATA_DIR` durante las pruebas. Los videos superpuestos no admiten todos los ajustes del video principal y no pueden recibir el estilo completo.

## Comprobar

```powershell
npm test
npm run build
cargo test --offline --manifest-path src-tauri/Cargo.toml --lib
```

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
- **Velocidad** admite **0,25× a 4×**, conservando el tono del audio. Con unión automática, los siguientes clips se desplazan al cambiar la duración. En modo libre se conserva su posición; si el cambio causa un solapamiento, se rechaza completo y se mantiene el valor anterior.
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
