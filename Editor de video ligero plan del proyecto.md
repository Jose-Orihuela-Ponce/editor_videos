# Editor de video ligero para Windows: plan del proyecto

Plan de referencia para el modelo que construirá la aplicación · 26 de octubre de 2026

## 1. Objetivo y principios

Un editor de video de escritorio para Windows que trabaja como CapCut, pero solo con las funciones que el usuario realmente usa. Debe abrir rápido, editar con fluidez y exportar rápido. Sin cuenta, sin nube, sin efectos, sin plantillas.

- **Rápido primero:** cada decisión técnica se juzga por velocidad de arranque, fluidez de la vista previa y velocidad de exportación.
- **Nada automático sin que el usuario lo pida:** al abrir, el usuario elige horizontal o vertical y si usa su preajuste. No se detecta ni se aplica nada solo.
- **Un proyecto son instrucciones de edición, no video.** Los videos originales no se modifican ni se copian salvo que el usuario lo pida.
- **Extensible:** agregar una herramienta es crear un módulo y registrarlo, sin tocar el núcleo.
- Interfaz en español. Código e identificadores en inglés.

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
| Borrar | Elimina el clip seleccionado (la pista se cierra sola) |
| Espejo H / Espejo V | Voltea el clip horizontal o verticalmente |
| Recortar | Activa el recuadro de recorte sobre la vista previa |
| Velocidad | Foco en el control de velocidad del panel |
| Volumen | Foco en el control de volumen del panel |
| Texto | Agrega un texto en la posición del cabezal |
| Unión automática | Interruptor, activado por defecto |

Los valores finos (velocidad exacta, X e Y, color de fondo del texto) están en el panel Propiedades.

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
| Carpeta:  Documentos/Editor/Exportados          |
| [x] Usar aceleración por hardware               |
| [#########-------] 58 %          [Cancelar]     |
+-------------------------------------------------+
```

## 5. Modelo de datos del proyecto

```ts
type Orientation = 'horizontal' | 'vertical';

interface Project {
  version: 1;                        // para migraciones
  name: string; updatedAt: string;
  orientation: Orientation;
  canvas: { w: number; h: number; fps: number };  // base 1920x1080 o 1080x1920
  autoJoin: boolean;                 // true por defecto
  copyMedia: boolean;                // false por defecto
  media: Media[];
  main: Clip[];                      // pista principal, en orden
  overlays: Overlay[];               // texto e imágenes, tiempos libres
  audio: AudioClip[];                // pistas de audio extra
  toolData: Record<string, unknown>; // datos de herramientas futuras
}

interface Media {
  id: string; kind: 'video' | 'image' | 'audio';
  path: string; relPath?: string;    // relPath si se copió al proyecto
  duration: number; w?: number; h?: number; fps?: number; hasAudio: boolean;
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
  srcStart: number; srcEnd: number;  // segundos del original
}   // duración en la línea de tiempo = (srcEnd - srcStart) / speed

interface Overlay {
  id: string; type: 'text' | 'image';
  start: number; duration: number;   // segundos en la línea de tiempo
  posX: number; posY: number; scale: number;
  text?: string; style?: TextStyle; mediaId?: string;
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

**Vista previa:** un contenedor del tamaño del lienzo escalado por `k = ancho mostrado / ancho del lienzo`, con `overflow: hidden`. Sobre el `<video>`: `transform: translate(posX*k, posY*k) scale(zoom*stretchX*signoH, zoom*stretchY*signoV)`. El recorte se hace con un contenedor interno. No se recodifica nada.

**FFmpeg, video de cada clip principal:**

```
[N:v]trim=start=S:end=E,setpts=(PTS-STARTPTS)/speed,
crop=iw*cw:ih*ch:iw*cx:ih*cy,hflip,vflip,
scale=trunc(Wb*zoom*stretchX/2)*2:trunc(Hb*zoom*stretchY/2)*2,setsar=1,fps=FPS[c]
color=black:s=WxH:r=FPS[bg]
[bg][c]overlay=x=(W-w)/2+posX:y=(H-h)/2+posY:shortest=1[vN]
```

`hflip` y `vflip` solo si están activos. Los segmentos `[vN]` se unen con `concat`. Si el tamaño exportado difiere del lienzo, `posX` y `posY` se multiplican por `exportW / canvasW`.

**Audio de cada clip:** `atrim`, `asetpts`, `atempo` encadenado (cada `atempo` acepta 0.5 a 2: 4x son dos de 2.0, 0.25x son dos de 0.5), `volume=V` y, si V > 1, `alimiter=limit=0.95` para evitar saturación. Clip sin audio: `anullsrc` de la misma duración. Las pistas de audio extra se colocan con `adelay` y se mezclan con `amix=normalize=0`.

**Volumen mayor a 100% en la vista previa:** `video` conectado una sola vez a Web Audio (`createMediaElementSource`) con un `GainNode`. Mostrar aviso de posible distorsión por encima de 150%.

**Texto:** no usar `drawtext`. Cada texto se dibuja en un canvas de la interfaz y se guarda como PNG transparente del tamaño exportado. Así tipo de letra, fondo y sombra son idénticos a la vista previa. Se superpone con `overlay=enable='between(t,A,B)'`. Las imágenes usan el mismo mecanismo.

## 7. Línea de tiempo y unión automática

- La pista principal es **magnética** y la unión automática viene activada. Al soltar o mover un clip, se pega al anterior. Al borrar o cambiar la velocidad de un clip, los siguientes se desplazan y no queda espacio vacío.
- Se reordena arrastrando. Al soltar entre dos clips, se inserta ahí.
- Unir un clip con otro es arrastrarlo junto al otro, o soltarlo sobre el borde.
- Con la unión automática desactivada se permiten huecos. En la exportación, un hueco es negro con silencio.
- Las pistas de texto, imagen y audio son **libres**: el usuario las coloca en cualquier tiempo. No se mueven cuando cambia la pista principal.
- Dividir corta el clip bajo el cabezal en dos clips con los mismos ajustes. Borrar un tramo es dividir dos veces y borrar el clip del medio.
- Estructura: clips como `div` con posición absoluta (decenas de clips, no miles). Miniaturas y ondas son imágenes pregeneradas. Eventos de puntero para arrastrar. Escala de zoom de la línea de tiempo ajustable.

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

## 9. Preajustes

- **Dos preajustes independientes:** uno para horizontal y otro para vertical. Cada orientación guarda un solo preajuste, llamado Mi estilo. La alternativa es Sin preajuste.
- **Qué guarda:** `ClipSettings` (velocidad, volumen, espejo, zoom, estirado, posición X e Y, recorte) y `TextStyle` (letra, tamaño, color, fondo). **No guarda** los cortes ni las palabras del texto.
- **Guardar:** botón Guardar ajustes como preajuste en el clip seleccionado. Escribe en el preajuste de la orientación del proyecto actual. Un botón equivalente guarda el estilo de un texto.
- **Usar:** selector en la pantalla de inicio y en el panel Medios (Al agregar: Sin preajuste / Mi estilo). Con preajuste, cada video nuevo entra con esos ajustes. Con Sin preajuste entra limpio.
- **Restablecer:** botón en el clip que lo devuelve a los valores por defecto, sin borrarlo.
- **Copiar y pegar ajustes** entre clips del proyecto abierto (Ctrl+Alt+C y Ctrl+Alt+V).
- **Archivos:** `Preajustes/horizontal.json` y `Preajustes/vertical.json`.

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
+-- Exportados/
```

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
- **Cuadros por segundo:** los del primer clip, con máximo de 60. Si no se conocen, 30.
- **Formatos:** MP4 con H.264 y AAC de 192 kbps. MP3 con libmp3lame (`-q:a 2`), solo audio y sin filtros de video.
- **Aceleración por hardware:** en el primer arranque se detectan los codificadores disponibles (`ffmpeg -encoders` y una prueba corta). Orden de preferencia: `h264_nvenc`, `h264_qsv`, `h264_amf`, `libx264` (`-preset veryfast -crf 20`). Si el codificador por hardware falla, reintenta solo con `libx264`.
- **Flujo:** la interfaz genera los PNG de texto en una carpeta temporal, construye el filtergraph y lo escribe en un archivo para `-filter_complex_script`. Rust ejecuta FFmpeg con `-progress pipe:1`. El porcentaje es `out_time / duración total`. Cancelar mata el proceso y borra el archivo parcial.

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
| Ctrl+Alt+C / Ctrl+Alt+V | Copiar y pegar ajustes |

## 14. Etapas de construcción

Cada etapa termina con algo que funciona y se puede probar.

1. **Base.** Proyecto Tauri, FFmpeg y FFprobe como sidecar, pantalla de inicio (horizontal, vertical, lista de proyectos), crear, guardar y abrir proyectos con la estructura de la sección 10, historial para deshacer. *Listo cuando:* se crea un proyecto, se guarda, se cierra y se reabre igual.
2. **Edición básica.** Importar videos, vista previa, línea de tiempo magnética, dividir, borrar, reordenar, exportar MP4 y MP3 con las calidades de la sección 11. *Listo cuando:* un video cortado exporta correcto y con hardware si está disponible.
3. **Transformaciones.** Velocidad, volumen (hasta 200%), espejo H y V, zoom, posición X e Y con campos y flechas, estirado X e Y, recorte. Vista previa y exportación coinciden según la sección 6.
4. **Capas.** Texto con letra, color y fondo, imágenes superpuestas, pistas de audio extra con velocidad y volumen.
5. **Preajustes.** Dos preajustes independientes por orientación, selector en inicio y en Medios, restablecer, copiar y pegar ajustes.
6. **Pulido.** Localizar medios faltantes, proxies, atajos completos, aviso de cambios sin guardar, instalador NSIS.
7. **Futuro, opcional.** Subtítulos automáticos con Whisper local.

## 15. Fuera de alcance y pendientes

**Fuera de alcance:** efectos, filtros, transiciones, stickers, plantillas, cuentas, nube, telemetría, edición multicámara, fotogramas clave.

**Incluido sin que el usuario lo haya pedido:** deshacer y rehacer, porque cualquier editor lo necesita.

**Pendientes de confirmar al probar con el usuario:**

- Sentido del eje Y (positivo hacia abajo o hacia arriba).
- Herramientas que el usuario recuerde al usar la aplicación. La estructura de la sección 8 permite sumarlas sin tocar el núcleo.
