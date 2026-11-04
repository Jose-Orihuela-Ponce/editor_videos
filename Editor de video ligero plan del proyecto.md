# Editor de video ligero para Windows: plan del proyecto

Plan de referencia para el modelo que construirá la aplicación · 26 de octubre de 2026

Actualizado el 28 de octubre de 2026: zoom adaptable con Ctrl + rueda, edición temporal con tijeras y panel contextual de escala uniforme/independiente y posición X/Y. Las superposiciones de video se incorporan en la etapa 4.

## 1. Objetivo y principios

Un editor de video de escritorio para Windows que trabaja como CapCut, pero solo con las funciones que el usuario realmente usa. Debe abrir rápido, editar con fluidez y exportar rápido. Sin cuenta, sin nube, sin efectos, sin plantillas.

- **Rápido primero:** cada decisión técnica se juzga por velocidad de arranque, fluidez de la vista previa y velocidad de exportación.
- **Nada automático sin que el usuario lo pida:** al abrir, el usuario elige horizontal o vertical y si usa su preajuste. No se detecta ni se aplica nada solo.
- **Un proyecto son instrucciones de edición, no video.** Los videos originales no se modifican ni se copian salvo que el usuario lo pida.
- **Extensible:** agregar una herramienta es crear un módulo y registrarlo, sin tocar el núcleo.
- Interfaz en español. Código e identificadores en inglés. Tema oscuro con acentos azules, incluidos selección, controles, guías, línea de tiempo e icono de la aplicación.

## 2. Tecnología

**Decisión: Tauri 2 + WebView2 (interfaz en React + TypeScript) + Rust (núcleo) + FFmpeg (sidecar).** Solo Windows 10/11 de 64 bits.

| Opción | Arranque y peso | Vista previa | Dificultad | Veredicto |
| --- | --- | --- | --- | --- |
| Electron | Más lento, instalador de 100 MB o más | `<video>` de Chromium | Baja | Descartada: es justo lo que se quiere evitar |
| Tauri 2 + WebView2 | Rápido, instalador de pocos MB (WebView2 ya viene en Windows 10/11) | `<video>` de WebView2 con GPU | Media | **Elegida** |
| Nativa (C# WinUI/WPF, o C++ con Qt y libmpv) | Lo más rápido | Control total | Alta: línea de tiempo y herramientas a mano | Solo si Tauri se queda corto |

Piezas:

- **Interfaz:** React + TypeScript + Vite. Estado con Zustand. Deshacer y rehacer con historial de parches (immer).
- **Rust (Tauri):** leer y escribir proyectos y preajustes, ejecutar FFmpeg y FFprobe, progreso y cancelación, miniaturas, ondas de audio, detección de codificadores.
- **FFmpeg y FFprobe** incluidos como sidecar (`externalBin`) de Tauri. La compilación con libx264 es GPL: aceptable para uso personal.
- **Instalador:** NSIS.

La velocidad no viene de la librería de interfaz, sino de las tácticas de la sección 12.

## 3. Arquitectura

```
+----------------- Interfaz (React + TypeScript) ------------------+
| Inicio | Editor | Exportar                                      |
| Estado del proyecto (Zustand + historial para deshacer)         |
| tools/: split delete flip crop speed volume transform text      |
|         image audio autojoin  (cada una es un módulo)           |
| Vista previa: <video> + CSS transform + Web Audio (volumen)     |
+-------------------^----------------------------+----------------+
          eventos   |                            | invoke (comandos)
        (progreso)  |                            v
+-------------------+----------------------------+----------------+
|                  Núcleo en Rust (Tauri 2)                       |
| proyectos y preajustes | probe | miniaturas | ondas | run_ffmpeg |
+--------------------------------+--------------------------------+
                                 | procesos
                         +-------v--------+
                         | ffmpeg/ffprobe |  sidecar, con hardware
                         +----------------+
```

**Regla clave:** la interfaz construye el filtergraph de FFmpeg a partir del proyecto (cada herramienta aporta su fragmento) y Rust solo lo ejecuta y reporta el progreso. Así cada herramienta vive completa en una sola carpeta.

**Controlador de reproducción simple:** `core/playback.ts` coordina un `<video>` para la pista principal y los elementos de audio adicionales cuando se incorporen en la etapa 4. Convierte el tiempo del proyecto al original con `srcStart + (projectTime - start) * speed`; cada elemento está activo en el intervalo `[start, end)`. Al cambiar de archivo o buscar, pausa el reloj y el audio, espera la carga y la búsqueda necesarias y después actualiza la vista o reanuda. Descarta respuestas de búsquedas anteriores. Durante un hueco mantiene el lienzo negro, silencia el audio principal y hace avanzar el reloj del proyecto; las pistas adicionales siguen sus propios intervalos. Al pausar, buscar o cambiar de clip sincroniza las pistas activas y corrige los desfases detectados. Se empieza con un solo reproductor; la precarga o un segundo reproductor se añaden únicamente si las mediciones lo justifican.

## 4. Pantallas

### 4.1 Inicio

```
+--------------------------------------------------------------+
| Editor                                                       |
|                                                              |
|  +---------------------------+  +-------------------------+  |
|  | Nuevo proyecto horizontal |  | Nuevo proyecto vertical |  |
|  |          16:9             |  |          9:16           |  |
|  +---------------------------+  +-------------------------+  |
|                                                              |
|  Preajuste:  ( ) Sin preajuste   (o) Mi estilo               |
|                                                              |
|  Proyectos recientes                                         |
|  [mini] Mi video      26 oct 2026   Horizontal       [...]   |
|  [mini] Short viaje   24 oct 2026   Vertical         [...]   |
+--------------------------------------------------------------+
```

- El menú `[...]` ofrece abrir, renombrar, duplicar y borrar.
- El selector de preajuste se aplica a la orientación elegida. Valor inicial: Sin preajuste. Recuerda la última elección.
- Al elegir horizontal o vertical se abre el editor vacío. El usuario agrega sus archivos y edita.

### 4.2 Editor horizontal (16:9)

```
+--------------------------------------------------------------------+
| < Inicio  Mi video (sin guardar) [Guardar]  [Calidad][MP4][Exportar]|
+-------------+-------------------------------+----------------------+
| MEDIOS      |        VISTA PREVIA 16:9      | PROPIEDADES          |
| videos      |                               | (del clip o texto    |
| imágenes    |                               |  seleccionado)       |
| audio       |                               | velocidad, volumen,  |
| Al agregar: |                               | zoom, X, Y, estirar, |
| [Preajuste] |                               | recorte, texto...    |
+-------------+-------------------------------+----------------------+
| BARRA: Dividir | Borrar | Espejo H | Espejo V | Recortar | Velocidad |
|        Volumen | Texto | Unión automática [x]                       |
+--------------------------------------------------------------------+
| LÍNEA DE TIEMPO (ver 4.5)                                          |
+--------------------------------------------------------------------+
```

### 4.3 Editor vertical (9:16)

La vista previa pasa a la derecha y ocupa toda la altura. La barra de herramientas queda encima de la línea de tiempo, junto a la vista previa.

```
+--------------------------------------------------------------+
| encabezado igual al horizontal                               |
+-------------+----------------------------+-------------------+
| MEDIOS      | BARRA DE HERRAMIENTAS      |                   |
|             +----------------------------+   VISTA PREVIA    |
+-------------+                            |   9:16            |
| PROPIEDADES | LÍNEA DE TIEMPO            |   (altura total)  |
|             |                            |                   |
+-------------+----------------------------+-------------------+
```

La orientación se puede cambiar después desde el editor. El lienzo cambia entre 1920x1080 y 1080x1920.

### 4.4 Barra de herramientas

Botones fijos entre la vista previa y la línea de tiempo. Actúan sobre el clip seleccionado:

| Botón | Acción |
| --- | --- |
| Dividir | Corta el clip en la posición del cabezal |
| Borrar | Elimina el clip seleccionado (la pista se cierra si la unión automática está activa) |
| Espejo H / Espejo V | Voltea el clip horizontal o verticalmente |
| Recortar | Activa el recuadro de recorte sobre la vista previa |
| Velocidad | Foco en el control de velocidad del panel |
| Volumen | Foco en el control de volumen del panel |
| Texto | Agrega un texto en la posición del cabezal |
| Unión automática | Interruptor, activado por defecto |

Los valores finos (velocidad exacta, X e Y, color de fondo del texto) están en el panel Propiedades.

**Panel contextual:** al seleccionar un clip en la línea de tiempo aparecen sus controles. En la etapa 3, los controles principales de imagen son **Escala** y **Posición X/Y**. Escala uniforme está activada por defecto: un solo control agranda o reduce conservando las proporciones. Al desmarcarla aparecen dos controles, **Ancho** y **Alto**, para escalar cada eje de forma independiente y poder deformar la imagen. Cambiar este interruptor conserva el encuadre actual hasta que el usuario ajuste un valor. Los controles de escala y posición muestran números enteros, sin decimales ni textos explicativos debajo de escala o X/Y. Mostrar los valores redondeados no altera los ajustes guardados. Se reutilizan `zoom`, `stretchX` y `stretchY`; no se necesita otro formato de proyecto. También se puede seleccionar y arrastrar la imagen visible con el mouse para cambiar X/Y directamente en la previsualización; al comenzar se pausa la reproducción y cada arrastre es una sola acción de deshacer/rehacer. El movimiento sigue la dirección del mouse aunque haya espejos o escala. Al acercarse al centro aparecen guías horizontal y vertical y se ajusta magnéticamente X/Y a cero; el imán se libera al alejar el mouse y Alt permite mover libremente. Las guías son temporales y no se guardan ni exportan. No se agrega rotación.

No hay campos de entrada/salida ni botón «Aplicar recorte» para la duración del clip: el usuario coloca el cabezal con el mouse, divide con las tijeras y elimina el fragmento. El recorte geométrico de la imagen es otra herramienta y conserva su etapa prevista.

### 4.5 Línea de tiempo

```
           0:00      0:10      0:20      0:30
Texto/img  |   [Título]     [imagen]                 |  libre
Principal  |[clip A][clip B][  clip C  ][clip D]     |  magnética
Audio      |[música ..............]                  |  libre
            ^ cabezal
```

### 4.6 Exportar

```
+-- Exportar -------------------------------------+
| Nombre:   [ Mi video            ]               |
| Formato:  (o) MP4 video   ( ) MP3 solo audio    |
| Calidad:  [ Original v ]  480p 720p 1080p       |
| Carpeta:  Videos/ediciones          |
| [x] Usar aceleración por hardware               |
| [#########-------] 58 %          [Cancelar]     |
+-------------------------------------------------+
```

## 5. Modelo de datos del proyecto

```ts
type Orientation = 'horizontal' | 'vertical';

interface Project {
  version: 1;                        // para migraciones
  id: string;                        // identificador estable del proyecto y su carpeta
  name: string; updatedAt: string;
  orientation: Orientation;
  canvas: { w: number; h: number; fps: number };  // base 1080p; fps = 30 para el cabezal
  autoJoin: boolean;                 // true por defecto
  copyMedia: boolean;                // false por defecto
  media: Media[];
  main: Clip[];                      // pista principal, en orden
  overlays: Overlay[];               // texto, imágenes y videos, tiempos libres (etapa 4)
  audio: AudioClip[];                // pistas de audio extra
  toolData: Record<string, unknown>; // datos de herramientas futuras
}

interface Media {
  id: string; kind: 'video' | 'image' | 'audio';
  path: string; relPath?: string;    // relPath si se copió al proyecto
  duration: number; w?: number; h?: number; fps?: number; hasAudio: boolean;
  thumbnail?: string;               // miniatura regenerable; no copia el original
}

interface ClipSettings {             // esto es lo que guarda un preajuste
  speed: number;                     // 0.25 a 4, por defecto 1
  volume: number;                    // 0 a 2, por defecto 1
  flipH: boolean; flipV: boolean;
  zoom: number;                      // 1 = encaja en el lienzo
  stretchX: number; stretchY: number;  // 1 por defecto
  posX: number; posY: number;        // píxeles del lienzo desde el centro
  crop: { x: number; y: number; w: number; h: number };  // 0 a 1 sobre el original
}

interface Clip extends ClipSettings {
  id: string; mediaId: string;
  start: number;                   // segundos en la línea de tiempo, >= 0
  srcStart: number; srcEnd: number;  // segundos del original
}   // duración en la línea de tiempo = (srcEnd - srcStart) / speed

interface Overlay {
  id: string; type: 'text' | 'image' | 'video'; // ampliar los tipos al implementar la etapa 4
  start: number; duration: number;   // segundos en la línea de tiempo
  posX: number; posY: number; scale: number;
  text?: string; style?: TextStyle; mediaId?: string;
  srcStart?: number; srcEnd?: number; speed?: number; volume?: number; // para video
}

interface TextStyle {
  font: string; size: number; color: string;
  bgColor?: string; bgOpacity?: number; bold?: boolean;
  align: 'left' | 'center' | 'right';
}

interface AudioClip {
  id: string; mediaId: string;
  start: number; srcStart: number; srcEnd: number;
  speed: number; volume: number;
}
```

El eje Y de `posY` es positivo hacia abajo (convención de pantalla). Confirmar con el usuario al probar.

**Tiempo:** clips, capas y audio guardan sus posiciones en segundos. Una función compartida calcula las duraciones y convierte tiempos al cortar, reproducir y exportar; el redondeo a fotogramas se realiza al presentar el cabezal o generar la salida. Al dividir se conserva la continuidad del tiempo original y no se acumulan redondeos por operación. `canvas.fps` empieza en 30 y define el paso del cabezal; los FPS de salida siguen la regla de la sección 11. No es necesario cambiar todo el modelo a fotogramas enteros.

## 6. Geometría del clip: la vista previa y la exportación deben coincidir

Orden de operaciones, idéntico en la vista previa y en FFmpeg:

1. Recortar según `crop`.
2. Voltear (`flipH`, `flipV`).
3. Encajar el resultado dentro del lienzo sin deformar (tamaño base Wb x Hb).
4. Multiplicar: ancho por `zoom * stretchX`, alto por `zoom * stretchY`.
5. Centrar en el lienzo y desplazar por (`posX`, `posY`).
6. Lo que sale del lienzo se corta. El fondo es negro.

```
Proyecto (JSON) --> Vista previa: <video> + transform CSS (GPU)   [instantánea]
       |
       +--------> Exportar: filtergraph de FFmpeg --> MP4 / MP3
```

**Vista previa:** un contenedor del tamaño del lienzo escalado por `k = ancho mostrado / ancho del lienzo`, con `overflow: hidden`. La proporción del lienzo se conserva al limitar tanto su ancho como su altura disponibles en la ventana. Sobre el `<video>`: `transform: translate(posX*k, posY*k) scale(zoom*stretchX*signoH, zoom*stretchY*signoV)`. El recorte se hace con un contenedor interno. No se recodifica nada.

**FFmpeg, video de cada clip principal:**

```
[N:v]trim=start=S:end=E,setpts=(PTS-STARTPTS)/speed,
crop=iw*cw:ih*ch:iw*cx:ih*cy,hflip,vflip,
scale=trunc(Wb*zoom*stretchX/2)*2:trunc(Hb*zoom*stretchY/2)*2,setsar=1,fps=FPS[c]
color=black:s=WxH:r=FPS[bg]
[bg][c]overlay=x=(W-w)/2+posX:y=(H-h)/2+posY:shortest=1[vN]
```

`hflip` y `vflip` solo si están activos. Los segmentos `[vN]` se unen con `concat`. Si el tamaño exportado difiere del lienzo, `posX` y `posY` se multiplican por `exportW / canvasW`.

**Audio de cada clip:** `atrim`, `asetpts`, `atempo` encadenado en factores entre 0.5 y 2 (4x son dos de 2.0; 0.25x son dos de 0.5) y `volume=V`. Clip sin audio: `anullsrc` de la misma duración. Usar un formato común estéreo a 48 kHz y ajustar cada segmento a su duración prevista. Las pistas de audio extra se colocan con `adelay` y se mezclan con `amix=normalize=0`. Después de sumar todas las pistas, aplicar un único `alimiter=limit=0.95:level=0:latency=1` y ajustar la mezcla final a la duración de exportación. Con una sola pista se usa la misma protección final. Así también se controla la saturación producida por la suma de pistas. [Referencia de mezcla y limitación de FFmpeg](https://ffmpeg.org/ffmpeg-filters.html).

**Volumen en la vista previa:** cada elemento de audio/video se conecta una sola vez a Web Audio (`createMediaElementSource`) con su `GainNode`. Las señales se suman en una salida común con un `DynamicsCompressorNode` configurado para proteger los picos. Esta es una aproximación sencilla a la protección de exportación; comprobar sincronización, ganancia y distorsión audible, sin exigir procesamiento idéntico entre ambos motores. Mostrar aviso de posible distorsión por encima de 150%. [Referencia del compresor de Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode).

**Texto:** no usar `drawtext`. Cada texto se dibuja en un canvas de la interfaz y se guarda como PNG transparente del tamaño exportado. Así tipo de letra, fondo y sombra son idénticos a la vista previa. Se superpone con `overlay=enable='between(t,A,B)'`. Las imágenes usan el mismo mecanismo.

## 7. Línea de tiempo y unión automática

- La pista principal es **magnética** y la unión automática viene activada. Al soltar o mover un clip, se pega al anterior. Al borrar o cambiar la velocidad de un clip, los siguientes se desplazan y no queda espacio vacío.
- Se reordena arrastrando. Al soltar entre dos clips, se inserta ahí.
- Unir un clip con otro es arrastrarlo junto al otro, o soltarlo sobre el borde.
- Con la unión automática desactivada se permiten huecos. En la exportación, un hueco es negro con silencio.
- `start` se recalcula al insertar, reordenar, borrar o cambiar velocidad con unión automática activa: el primero empieza en 0 y cada siguiente al final del anterior. En modo libre se conservan los inicios de los demás clips y `main` se mantiene ordenado por `start`; la pista principal no permite solapamientos. Si un movimiento o ajuste los produce, se conserva el valor anterior y se indica el motivo. Al activar la unión automática se compactan los huecos como una sola acción que se puede deshacer.
- Las pistas de texto, imagen y audio son **libres**: el usuario las coloca en cualquier tiempo. No se mueven cuando cambia la pista principal.
- Dividir corta el clip bajo el cabezal en dos clips con los mismos ajustes. Borrar un tramo es dividir dos veces y borrar el clip del medio.
- El mismo control de zoom permite acercar y alejar: su mínimo permite contraer el montaje un 20% más allá del encaje según la duración total y el ancho disponible, también después de agregar clips o redimensionar la ventana. **Sin botón «Ver todo». Ctrl + rueda del mouse** sobre la línea de tiempo cambia el zoom conservando como referencia el tiempo bajo el cursor. Este zoom solo cambia la vista; no afecta a la escala del video, al archivo del proyecto ni a deshacer/rehacer.
- Estructura: clips como `div` con posición absoluta (decenas de clips, no miles). Miniaturas y ondas son imágenes pregeneradas. Eventos de puntero para arrastrar. Marcas de tiempo adaptadas al zoom; solo se generan las visibles.

## 8. Herramientas como módulos

Cada herramienta es una carpeta que implementa esta interfaz y se registra en un solo archivo:

```ts
interface Tool {
  id: string;                  // 'flip', 'crop', 'speed', ...
  label: string;
  scope: 'clip' | 'overlay' | 'project';
  defaults: object;            // valores iniciales
  inPreset: boolean;           // si la guarda el preajuste
  ToolbarButton: Component;    // botón de la barra
  Panel: Component;            // controles en Propiedades
  applyPreview(state, ctx): PreviewEffect;   // cómo se ve y se oye
  exportFilter(state, ctx): { video?: string[]; audio?: string[] };  // fragmentos de FFmpeg
}
```

```
src/
  core/       proyecto, historial, línea de tiempo, exportación
  tools/      una carpeta por herramienta
    split/ delete/ flip/ crop/ speed/ volume/ transform/
    text/ image/ audio/ autojoin/
    index.ts  registro: aquí se agrega una herramienta nueva
  screens/    start/ editor/
src-tauri/    Rust: proyectos, ffmpeg, miniaturas
```

Para agregar una herramienta: crear su carpeta y registrarla en `tools/index.ts`. Los datos nuevos van en `ClipSettings` o en `toolData`. La migración de versión rellena los valores por defecto en proyectos antiguos.

## 9. Estilos

El usuario corrigió el flujo: **Guardar estilo** y **Aplicar estilo** están en la parte superior del editor. Cada orientación conserva un estilo independiente. Al guardar con un video principal seleccionado, se guardan sus ajustes y los textos que aparecen durante ese video, incluidas sus palabras, estilo, posición, escala y tiempos relativos. Con un texto seleccionado se usa el video principal bajo el cabezal o el del comienzo del texto.

Al aplicar a otro video principal se conservan sus cortes, se aplican los ajustes del video y se agregan copias de los textos en sus tiempos relativos; las copias se limitan a la duración del video, sin borrar textos existentes. Al aplicar a un texto seleccionado se copia el primer texto guardado, su formato y su posición, conservando su tiempo y duración. Todo se aplica en una acción de historial. Los videos superpuestos aún no admiten todas las transformaciones del video principal. Se conservan Restablecer y copiar/pegar ajustes entre elementos del mismo tipo.

Los archivos permanecen en `Preajustes/horizontal.json` y `Preajustes/vertical.json`; se aceptan los preajustes anteriores sin textos completos. El selector automático de inicio y Medios se retiró por petición del usuario.

## 10. Almacenamiento

```
Documentos/Editor/
+-- Proyectos/
|   +-- 2026-10-26 Mi video/
|       +-- proyecto.json       instrucciones de edición
|       +-- proyecto.json.bak   versión anterior
|       +-- miniatura.jpg       para la lista de inicio
|       +-- medios/             solo si copyMedia = true
|       +-- cache/              miniaturas, ondas, proxies (se regenera)
+-- Preajustes/
|   +-- horizontal.json
|   +-- vertical.json
```

Las exportaciones se guardan por defecto en `Videos/ediciones/` del usuario (en este equipo, `C:\Users\freud\Videos\ediciones`), independientemente de la carpeta de proyectos o `EDITOR_DATA_DIR`. El cuadro de exportación muestra la ruta completa y permite elegir otra carpeta.

Los ajustes de la aplicación (carpeta base, último preajuste elegido, aceleración por hardware) van en `%APPDATA%/Editor/settings.json`.

- **Guardado manual:** botón Guardar y Ctrl+S. Indicador sin guardar en el encabezado. Aviso al cerrar o volver al inicio con cambios pendientes.
- **Escritura atómica:** escribir `proyecto.json.tmp`, mover el actual a `.bak`, renombrar el temporal.
- **Versión y migraciones:** el campo `version` permite abrir proyectos antiguos al agregar herramientas.
- **Medios faltantes:** si un original se movió o borró, aviso Archivo no encontrado con botón Localizar. Opción por proyecto Copiar los medios al proyecto (desactivada por defecto) para que el proyecto sea independiente.
- **Sin estados:** no hay proyecto en curso o terminado. Cualquiera se puede reabrir, aunque ya se haya exportado.
- **Duplicar proyecto** copia la carpeta sin `cache/`.

## 11. Exportación

- **Calidad:** Original, 1080p, 720p, 480p. 1080p es 1920x1080 en horizontal y 1080x1920 en vertical. **Original** usa la resolución del primer clip de la pista principal, adaptada a la orientación, sin aumentar nunca. Si no hay clips, 1080p.
- **Lienzo y coordenadas:** el lienzo de edición es siempre de base 1080p. Al exportar a otro tamaño se aplica el factor `exportW / canvasW` a posiciones y tamaños.
- **Cuadros por segundo:** los del primer clip de la pista principal, con máximo de 60. Si no se conocen o no hay clips, 30. Se conserva la tasa disponible, incluidas las fraccionarias. Es una regla de salida independiente de `canvas.fps`: reordenar el primer clip puede cambiar los FPS exportados, pero no mueve los tiempos guardados en segundos. El cuadro de exportación muestra los FPS efectivos.
- **Duración:** si hay clips principales, exportar hasta el final del último (`max(start + duración)`). La música y las capas que lo superen se recortan solo en la salida; siguen completas en el proyecto. Si no hay clips principales, usar el final del último texto, imagen o audio. MP4 y MP3 usan el mismo rango desde 0 hasta ese final. Un proyecto sin elementos no se exporta. Mostrar la duración resultante antes de iniciar; vista previa, mezcla y porcentaje de progreso usan ese mismo límite.
- **Formatos:** MP4 con H.264 y AAC de 192 kbps. MP3 con libmp3lame (`-q:a 2`), solo audio y sin filtros de video.
- **Aceleración por hardware:** la primera exportación MP4 con esta opción prueba brevemente los codificadores y conserva el resultado durante la sesión. Orden de preferencia: `h264_nvenc`, `h264_qsv`, `h264_amf`, `libx264` (`-preset veryfast -crf 20`). Si falla el codificador por hardware, reintenta con `libx264`; los errores de fuentes, filtros o escritura se muestran directamente.
- **Flujo:** la interfaz genera los PNG de texto cuando se incorpore esa herramienta, construye el filtergraph y lo escribe en un archivo para `-/filter_complex`. Rust ejecuta FFmpeg con `-progress pipe:1`. El porcentaje es `out_time / duración total`. Se exporta una instantánea del proyecto a un archivo temporal único; solo al terminar se publica la salida, con otro nombre si ya existe. Cancelar mata el proceso y borra el parcial.

## 12. Rendimiento

**Objetivos a verificar:** ventana visible y usable en menos de 1.5 s. Abrir un proyecto típico en menos de 1 s. Vista previa y línea de tiempo fluidas a 60 cuadros por segundo. Exportación con hardware varias veces más rápida que el tiempo real.

**Tácticas:**

- La vista previa **no recodifica**: usa el video original con `transform` CSS acelerado por GPU y Web Audio. Mover, hacer zoom o voltear es instantáneo.
- Sin Electron y sin dependencias pesadas. Carga diferida de pantallas.
- La lista de proyectos lee archivos pequeños en paralelo desde Rust.
- Miniaturas y ondas de audio se generan en segundo plano y se guardan en `cache/`.
- **Proxies:** si WebView2 no puede reproducir un archivo (por ejemplo HEVC sin la extensión de Windows) o supera 1080p, se genera en segundo plano un proxy H.264 de 720p solo para la vista previa. La exportación siempre usa el original.
- Durante un arrastre solo se redibuja el clip movido. Estado con actualizaciones puntuales.
- FFmpeg siempre fuera del hilo de interfaz.
- Acceso a archivos locales con el protocolo asset de Tauri (`convertFileSrc`), con alcance limitado a las carpetas del usuario. Permisos de Tauri mínimos: solo los sidecars de FFmpeg y FFprobe.

## 13. Atajos de teclado

| Tecla | Acción |
| --- | --- |
| Espacio | Reproducir y pausar |
| S | Dividir en el cabezal |
| Supr | Borrar el clip seleccionado |
| Ctrl+S | Guardar |
| Ctrl+Z / Ctrl+Shift+Z | Deshacer / rehacer |
| Flechas | Mover el clip seleccionado 1 píxel (Shift: 10) en X e Y |
| Coma y punto | Cabezal un fotograma atrás y adelante |
| Ctrl + rueda del mouse | Acercar o alejar la línea de tiempo alrededor del cursor |
| Ctrl+Alt+C / Ctrl+Alt+V | Copiar y pegar ajustes |

## 14. Etapas de construcción

Cada etapa termina con algo que funciona y se puede probar.

Las aclaraciones anteriores se implementan dentro de la etapa que las necesita: esquema en la base, reproducción y prueba inicial en edición básica, volumen en transformaciones y mezcla de pistas en capas. Se mantiene el orden siguiente; la prueba técnica se incorpora a la primera versión que ya reproduce y exporta.

1. **Base.** Proyecto Tauri, FFmpeg y FFprobe como sidecar, pantalla de inicio (horizontal, vertical, lista de proyectos), crear, guardar y abrir proyectos con la estructura de la sección 10, historial para deshacer. *Listo cuando:* se crea un proyecto, se guarda, se cierra y se reabre igual.
2. **Edición básica.** Importar videos, vista previa con controlador simple, línea de tiempo magnética y posiciones `start`, dividir con tijeras, borrar, reordenar, zoom adaptable hasta encajar todo con el deslizador o Ctrl + rueda, exportar MP4 y MP3 con las calidades de la sección 11. Sin entrada/salida numéricas. *Listo cuando:* dos clips MP4/H.264 con recortes se reproducen y exportan con cortes, encuadre y audio sincronizados, y con hardware si está disponible. Medir respuesta al buscar, pausas entre clips y tiempo de exportación en el equipo objetivo; corregir aquí los fallos de reproducción/exportación, y dejar las optimizaciones para cuando las mediciones las justifiquen.
3. **Transformaciones.** Panel contextual al seleccionar un clip: priorizar escala uniforme (un control), escala independiente de ancho/alto al desmarcar la opción y posición X/Y con campos, flechas y arrastre directo en la previsualización. Sin rotación. Velocidad, volumen (hasta 200%), espejo H y V y recorte geométrico conservan su alcance. Vista previa y exportación coinciden según la sección 6. Ampliar la prueba inicial para comparar encuadre, cortes y audio al cambiar velocidad y transformaciones, en horizontal y vertical.
4. **Capas.** Agregar pistas adicionales para superponer videos, varios textos, imágenes y audios en el mismo intervalo, sin limitar cada tipo a una sola línea. Texto con letra, color y fondo; videos y audios extra con velocidad y volumen. Ampliar la misma prueba con música y audio original simultáneos: comprobar sincronización, control de picos y recorte de salida a la duración definida, sin borrar contenido del proyecto.
5. **Estilos.** Un estilo conjunto por orientación, guardado y aplicado desde la barra superior; restablecer, copiar y pegar ajustes, según la sección 9.
6. **Pulido.** Localizar medios faltantes con validación y deshacer; proxies H.264 de vista previa para archivos de más de 1080p o con error de reproducción, exportando siempre desde el original; atajos, aviso de cambios sin guardar e instalador NSIS.
7. **Futuro, opcional.** Subtítulos automáticos con Whisper local.

### Ampliación autorizada: modo automático de YouTube

Autorizada el 3 de noviembre de 2026, independiente de Whisper. En el inicio se elige Editor manual o Modo automático. Este último recibe un enlace de un video individual de YouTube, orientación, calidad (1080p con alternativa 720p, o solo 720p) y carpeta de salida; aplica el estilo guardado por orientación y exporta un MP4 sin entrar a la línea de tiempo.

Reutilizar aplicación de estilos, preparación de textos con canvas y exportación con FFmpeg. No mantener otro motor de edición. Descargar con yt-dlp y un runtime JavaScript incluido; validar enlaces de YouTube en el núcleo, ignorar listas y parámetros ajenos al identificador del video y rechazar directos en curso. No elegir resoluciones inferiores ni aumentar artificialmente la calidad. La resolución se mide por el lado menor, también en vertical.

Conservar los originales descargados en `Editor/Automaticos/<id>/`, separados de Proyectos; limpiar los parciales al cancelar o fallar la descarga. Exportar con la opción Original del editor, con progreso, cancelación y sin sobrescrituras. La pantalla debe usar el estilo visual del editor, controles ordenados y textos mínimos. Recordar orientación, calidad y carpeta en el almacenamiento local de la interfaz. El procesamiento automático no modifica el proyecto manual ni su historial.

Listo cuando: un enlace de YouTube produce un MP4 con el estilo guardado, se verifica cancelación y manejo de errores, y el resultado coincide con exportar el mismo original manualmente. Comprobar la aplicación Tauri real, no solo la vista web. Fuera de esta ampliación: otros proveedores, lotes, cuentas/cookies, subtítulos automáticos y ejecución por script sin la app.

## 15. Fuera de alcance y pendientes

**Fuera de alcance:** efectos, filtros, transiciones, stickers, plantillas, cuentas, nube, telemetría, edición multicámara, fotogramas clave.

**Incluido sin que el usuario lo haya pedido:** deshacer y rehacer, porque cualquier editor lo necesita.

**Pendientes de confirmar al probar con el usuario:**

- Sentido del eje Y (positivo hacia abajo o hacia arriba).
- Herramientas que el usuario recuerde al usar la aplicación. La estructura de la sección 8 permite sumarlas sin tocar el núcleo.
