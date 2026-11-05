# Flujo automático: de enlace a video editado

Fecha: 3 de noviembre de 2026.

Estado: ampliación autorizada el 3 de noviembre de 2026 e incorporada al plan del proyecto. Se implementa dentro de la app existente, con selector Editor manual / Modo automático en el inicio, exclusivamente para videos individuales de YouTube. Comparte el motor de estilos y exportación del editor; no requiere un proyecto independiente. Este flujo es independiente de la etapa 7 opcional de Whisper.

## Objetivo

Recibir un enlace de video y producir automáticamente un MP4 con un estilo previamente guardado en el editor visual. El usuario no debe descargar el archivo por separado, abrir el editor de escritorio, importar el video, aplicar el estilo y pulsar Exportar en cada ocasión.

Los videos de entrada tienen un formato visual estándar, por lo que los ajustes de un estilo son replicables. El editor visual se utiliza para preparar, probar y guardar el estilo; un proceso de automatización lo utiliza después para cada enlace.

El resultado entregado debe ser el video final procesado, con los cambios visibles y audibles incorporados al MP4. Guardar instrucciones de edición o descargar únicamente el original no cumple el objetivo.

## Flujo esperado

1. Recibir un enlace y la configuración del trabajo: orientación, estilo, calidad preferida y carpeta de salida. Los valores habituales pueden quedar configurados para no preguntarlos en cada ejecución.
2. Consultar las calidades disponibles y descargar el video y su audio.
3. Verificar con FFprobe el archivo descargado: duración, dimensiones, FPS y presencia de audio.
4. Crear automáticamente un proyecto de trabajo con el video completo en la pista principal, desde el segundo cero.
5. Leer una copia del estilo guardado correspondiente a la orientación y aplicar los mismos ajustes que utiliza el editor.
6. Preparar los textos y construir el plan de exportación con las mismas reglas del editor.
7. Procesar con FFmpeg y publicar el MP4 final solo cuando la exportación termine correctamente.
8. Informar la ruta del resultado o el error concreto. No debe ser necesario abrir el editor completo durante este recorrido.

## Calidad de descarga y exportación

Reglas adoptadas:

- Calidad preferida predeterminada: 1080p; si no está disponible, usar 720p.
- Permitir configurar preferencia de 720p para priorizar menor tamaño y tiempo.
- Si no existe ninguna de las dos calidades, descargar la mejor inferior disponible (autorizado el 4 de noviembre de 2026), sin aumentar artificialmente sus dimensiones.
- No aumentar artificialmente la resolución de la descarga para presentarla como 720p o 1080p.
- Si el proveedor entrega video y audio separados, combinarlos antes de procesar la edición.
- Distinguir calidad descargada de resolución exportada. Como salida predeterminada se propone la opción «Original» del editor, adaptada a la orientación y sin aumento de resolución, conservando sus reglas de FPS y codificación.

La resolución de descarga se mide por el lado menor: 1280×720 y 720×1280 corresponden a 720p. Se usan las dimensiones reales anunciadas por YouTube y se verifican con FFprobe.

## Reutilización del estilo actual

El estilo se prepara una vez en el editor: importar un video representativo, ajustar su apariencia y sus textos, comprobar una exportación y pulsar **Guardar estilo**. El flujo automático debe leer ese formato existente, sin obligar a crear el mismo estilo en otro sistema.

Actualmente hay un estilo por orientación en `datos/Preajustes/horizontal.json` y `vertical.json` en este equipo, bajo la carpeta de datos configurada. Debe respetarse también `EDITOR_DATA_DIR`.

El estilo conjunto conserva:

- Escala, estiramiento independiente, posición, recorte y espejos del video principal.
- Velocidad y volumen.
- Contenido, formato, posición, escala, inicio relativo y duración de los textos guardados.

No representa un montaje completo: no guarda una secuencia de cortes ni incorpora automáticamente música, imágenes o videos superpuestos. Esas capacidades requerirían ampliar explícitamente el alcance.

Los textos deben conservar inicialmente la semántica actual: tiempos relativos en segundos, limitados a la duración del clip después de aplicar su velocidad; se omiten los que no tienen una duración visible válida. No deben estirarse proporcionalmente ni extenderse hasta el final por suposición. Si se desean textos permanentes o variables por enlace, se definirá como una mejora separada.

Cada trabajo debe usar una instantánea del estilo. Cambiar el estilo en el editor durante un procesamiento no debe alterar un trabajo ya iniciado.

## Enfoque técnico

Crear un coordinador o comando que encadene descarga, inspección, aplicación del estilo y exportación. La tecnología concreta y el descargador se elegirán al implementar, después de conocer las fuentes de los enlaces. El descargador debe ser un módulo reemplazable.

Priorizar la reutilización de las reglas existentes:

- `src/core/presets.ts`: formato del estilo, captura y aplicación al video y a sus textos.
- `src/core/export.ts`: construcción del plan de renderizado, geometría, duración, mezcla y resolución de salida.
- `src-tauri/src/presets.rs`: persistencia de preajustes.
- `src-tauri/src/export.rs`: ejecución de exportaciones en el núcleo de escritorio.

Antes de extraer módulos, revisar sus dependencias reales. Las funciones actuales utilizan partes del entorno React/Tauri y no constituyen por sí solas un comando autónomo listo para ejecutarse.

Los textos se exportan actualmente como PNG transparentes generados con canvas. Un proceso sin el editor completo debe disponer de un entorno de renderizado que reproduzca la tipografía, sus métricas y su composición. No sustituir directamente este mecanismo por otro que cambie la apariencia. Debe comprobarse la equivalencia visual antes de elegir la solución definitiva.

No duplicar por separado las fórmulas de encuadre, velocidad y audio si pueden compartirse. La referencia del resultado es la exportación del editor con el mismo original y el mismo estilo.

## Ejecución y archivos

La primera versión procesa un enlace por trabajo mediante una pantalla en el inicio de la app. Los campos son enlace de YouTube, orientación, calidad de descarga y carpeta de salida; el estilo guardado se elige por orientación. Orientación, calidad y carpeta se recuerdan localmente. No incluye ejecución por script ni integración con mensajería o servidor.

Cada trabajo debe tener un identificador y una carpeta temporal independiente. Registrar las etapas «Descargando», «Preparando estilo», «Exportando», «Completado», «Error» y «Cancelado», con progreso cuando esté disponible.

La exportación debe conservar el mecanismo de salida temporal y publicación final del editor, evitar sobrescribir resultados existentes y permitir cancelar los procesos asociados. Mantener intactos los estilos y los proyectos del usuario.

La carpeta de salida predeterminada puede ser `Videos/ediciones/`, como en el editor, con opción de configurarla. Definir explícitamente si se conserva la descarga original; no borrarla por defecto sin una política configurada. Los archivos parciales del trabajo sí deben limpiarse al cancelar o fallar.

La descarga original y `descarga.json` con el enlace normalizado, título y datos efectivos del medio se conservan en `Videos/ediciones/descargas/<id>/`. El estilo se toma como instantánea en memoria al comenzar. La pantalla muestra el estado y la ruta del MP4 final. El historial persistente de trabajos y el archivo de sus estilos quedan como mejora futura. Los fallos deben indicar la etapa afectada y no marcar un archivo incompleto como resultado final.

Si falta un estilo válido con ajustes de video, detener el trabajo con un mensaje claro. No entregar una exportación sin estilo como si se hubiera completado correctamente.

## Validación y criterios de aceptación

1. Partiendo de un estilo ya guardado y un enlace compatible, se obtiene un MP4 final sin abrir manualmente el editor ni importar el archivo.
2. Se comprueban los casos con 1080p disponible, respaldo a 720p y ausencia de ambas calidades.
3. Para un mismo original y estilo, comparar exportación manual y automática: encuadre, recorte, espejos, textos, duración, velocidad y audio deben coincidir visualmente y dentro de las tolerancias temporales del motor. No se exige igualdad binaria de archivos.
4. Verificar orientación horizontal y vertical, videos con y sin audio y originales más cortos y más largos que los textos guardados.
5. Probar enlace inválido, descarga interrumpida, estilo ausente o inválido, fallo de exportación, cancelación y nombre de salida repetido.
6. Verificar que guardar y volver a cargar el estilo conserva los ajustes; si se modifica persistencia o historial del editor, ejecutar también sus comprobaciones correspondientes.
7. Confirmar que el editor de escritorio mantiene su flujo actual de guardar/aplicar estilo y exportar. Una prueba de la vista web no sustituye una comprobación de Tauri.

## Alcance confirmado y mejoras futuras

- Solo YouTube; recepción por pantalla automática dentro de la app.
- 1080p con alternativa 720p, o preferencia 720p; error si no está disponible ninguna calidad admitida.
- Orientación elegida por el usuario; FFprobe verifica las dimensiones y la duración descargadas.
- Textos fijos y tiempos actuales del estilo, limitados a la duración final del clip.
- Conservar originales; no guardar automáticamente proyectos en la biblioteca manual.
- Futuro: ejecución por script, lotes, textos variables e historial persistente de trabajos.

## Indicación para la futura implementación

Implementar este flujo como una ampliación autorizada del proyecto, reutilizando los estilos y el motor de exportación actuales. Empezar con un enlace por trabajo y un estilo por orientación. Entregar una forma reproducible de ejecutarlo, un ejemplo documentado y una comparación con la exportación manual. Mantener la interfaz y los mensajes en español, el código y los identificadores en inglés, y actualizar `AVANCE.md` con comprobaciones reales y limitaciones pendientes.
