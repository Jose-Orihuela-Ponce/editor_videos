---
name: crear-miniaturas
description: "Crea miniaturas de entrevistas para YouTube con el estilo aprobado del usuario: explora el video, ofrece capturas, permite nuevas rondas y compone con texto y referencia visual indicados. Úsala para generar o ajustar estas miniaturas; es independiente de la edición del MP4."
---

# Miniaturas de entrevistas

Automatización asistida desde el chat: el agente explora, propone y compone; el usuario elige las capturas y el mensaje. Reanudar lo decidido sin volver a preguntarlo.

## Calibración en otro equipo

Cuando se solicite reproducir o comprobar los ejemplos aprobados, leer [reproduction.md](references/reproduction.md). Sus casos ya contienen las elecciones y textos aprobados: usarlos sin repetir las preguntas de un trabajo nuevo. Descargar videos únicamente a la carpeta local de pruebas. Generar una imagen nueva, compararla visualmente y registrar diferencias; no confundir preparar capturas con aprobar el resultado. La reproducción de pruebas no entrega archivos a Drive ni modifica las referencias aprobadas.

Esta skill necesita generación de imágenes y búsqueda disponibles en el chat; el archivo de instrucciones no instala esas herramientas. Si falta alguna, informar qué parte quedó sin probar y conservar los materiales preparados. El MP4 se procesa con el motor Tauri del proyecto; no introducir otro framework de video para esta operación.

## Entrada y continuidad

Reutilizar el video original descargado y el trabajo de producción si existen. Esta skill no renderiza ni modifica el MP4. Si solo hay un enlace, obtener el original con el descargador disponible; no iniciar una edición para conseguir capturas.

Conservar los registros en una carpeta local propia: en editor_videos, `<trabajo>/thumbnail/` o `.local/thumbnail-analysis/<referencia>/` para pruebas. Distinguir nombre corto, texto de miniatura y título de publicación. Guardar elecciones, contexto, texto, referencia, fuente, prompts, versiones y aprobación en `composition.json`.

## Capturas y nuevas rondas

Usar [scripts/extract_frames.py](scripts/extract_frames.py) para extraer originales y hojas con identificadores y tiempos; leer [references/extraction.md](references/extraction.md) para comandos. El script muestrea; el agente valora participantes y expresiones viendo las imágenes.

1. Explorar el video; unos 24 fotogramas repartidos suelen servir para ubicar intervalos. Refinar alrededor de planos útiles y descartar fundidos.
2. Proponer 3–4 candidatos del entrevistado (E) y 3–4 del presentador (P). Priorizar planos grandes, nítidos, ojos abiertos y una leve orientación de cabeza y mirada hacia el otro participante. La sensación de diálogo importa más que el gesto intenso. Evitar planos frontales que rompan esa relación; conservar manos cuando aporten.
3. Mostrar hojas legibles en el teléfono y recomendar una pareja sin darla por elegida. Esperar la elección de uno de cada grupo, salvo delegación expresa del usuario.
4. Si no convencen, buscar otra ronda según lo pedido: más lateral, seria, expresiva, otro momento, etc. Cambiar o ampliar el intervalo, no repetir la misma hoja. Continuar IDs (E5, P5...) y conservar tiempos y opciones previas. Si un participante ya está elegido, mantenerlo y buscar solo el otro; se pueden recuperar opciones anteriores o cambiar ambas.

Hay libertad para ajustar intervalos, variedad y encuadres. No inventar miradas, gestos, rostros ni vestuario. Si faltan planos apropiados, explicar qué se encontró y ofrecer las opciones reales.

## Contexto, referencia y texto

- Recibir la idea editorial del usuario y la persona o institución para el círculo. No inferir identidades desconocidas solo por la foto. Aprovechar lo ya proporcionado.
- Buscar en internet una imagen clara de esa referencia, comprobar que la página la identifica y guardar URL de página e imagen y crédito disponible. Inspeccionarla antes de usarla.
- Pedir siempre el texto de miniatura si falta. Si ya está dado o confirmado, continuar. El usuario decide el mensaje corto; no añadir un titular propio.
- Usar `corregir-textos` para ortografía, sintaxis, puntuación y grafías dudosas de figuras públicas con contexto peruano. Respetar la idea; proponer cualquier acortamiento sustancial para elección del usuario.
- Añadir comillas cuando lo pida o confirme el formato de la muestra. Registrar si es reformulación editorial; no presentarla como cita verificada sin cotejo. El título de publicación se corrige aparte.

## Estilo y composición

Consultar [references/style.json](references/style.json) e inspeccionar las dos referencias aprobadas: [assets/approved-01.png](assets/approved-01.png) y [assets/approved-02.png](assets/approved-02.png). Sus personas y titulares son ejemplos, no contenido para copiar.

- Entrevistado a la izquierda y presentador a la derecha, caras grandes y miradas naturales hacia el centro. Mantener identidad, expresión, ángulo, ropa y, cuando convenga, fondo azul de las capturas elegidas.
- Círculo superior central, borde oscuro fino y flecha curva roja con borde negro. Seguir la indicación del usuario sobre origen y destino.
- Texto inferior en mayúsculas blancas muy gruesas, contorno negro ancho y sombra. Luckiest Guy o fuente parecida; normalmente dos líneas.
- Degradado negro suave inferior y viñeta oscura en los bordes, sin humo literal. Quitar logos, horarios y rótulos del canal.
- Ajustar recorte, escala, círculo, flecha, sombreado y saltos de línea según las caras y longitud del texto. Mantener legibilidad en móvil y estilo, sin coordenadas rígidas.

Usar la herramienta integrada de imágenes y seguir `imagegen`, inspeccionando primero los archivos locales de entrada. En el prompt separar capturas elegidas, foto para el círculo y muestras de estilo. **Las capturas elegidas y el nuevo retrato tienen prioridad sobre caras, ropa e imágenes insertadas de las muestras.**

Revisar la salida real: pareja y retrato correctos, vestuario, expresión, texto completo, tildes, comillas, encuadre, flecha y sombreado. Si el modelo copia un retrato antiguo de la muestra, corregir solo ese elemento usando el resultado y la foto nueva. Corregir defectos visibles; no generar variantes indefinidamente sin necesidad concreta o petición.

## Entrega e iteración

Guardar `miniatura-v1.png`, `miniatura-v2.png`, etc., prompts y metadatos dentro del trabajo. Mostrar el resultado y esperar valoración. Un cambio de texto, círculo o encuadre conserva las demás elecciones salvo indicación contraria. Marcar aprobación solo cuando el usuario la exprese.

Esta skill funciona por conversación; no implica servicio en segundo plano ni integración paralela con la exportación. Se puede adelantar la exploración del original cuando el entorno lo permita, sin modificar el editor.

Si Drive está autorizado y configurado, entregar solo la miniatura aprobada a esa etapa en `Ediciones/<referencia>/`, junto a `video.mp4`. Registros locales; no crear otro destino ni volver a editar. En editor_videos: `node scripts/upload-drive.mjs --job <trabajo> --thumbnail <imagen-aprobada>`; Drive se encarga de subir y verificar. Esta skill no publica en YouTube.
