# Reproducir y calibrar los ejemplos

Usar este modo al pedir una comprobación en otra PC, una reproducción de ejemplo o una mejora de la skill basada en resultados. Para una entrevista nueva seguir el flujo normal de selección del usuario.

## Casos disponibles

`reproduction-cases.json` conserva dos ejemplos **aprobados por el usuario**, URL original, instantes del video sin editar, texto, persona del círculo, fuentes y referencia final. Los prompts históricos están en `prompts/`; incluyen una corrección real del círculo del segundo ejemplo. No contienen rutas de una entrega privada ni credenciales.

Desde la raíz del proyecto:

```powershell
npm run thumbnail:reproduce -- --list
npm run thumbnail:reproduce -- --case approved-01
npm run thumbnail:reproduce -- --case approved-02
```

El helper descarga solo el original de prueba (hasta 720p), extrae las dos capturas y prepara `request.json`, `prompt.txt` y `review.json` en `.local/reproductions/<caso>/run-*/`. No exporta el MP4 editado, no genera imágenes por API ni sube nada. Si el original ya existe, usar `--video "RUTA_DEL_ORIGINAL"` para no descargar de nuevo. `--portrait "FOTO"` permite usar una foto local identificada; registrar su fuente real en el informe. Si una URL falla, buscar otra foto de la misma persona y anotar el cambio; no sustituirla por un retrato de otro ejemplo.

Los tiempos son del **original**, no del MP4 acelerado. Los IDs se asignan por directorio: un P2 histórico puede convertirse en P1 en la prueba que extrae una sola captura. `originalCandidateId` y `seconds` identifican la elección original; `runCandidateId` identifica el archivo nuevo. Comparar la captura real con la referencia: si YouTube cambió el montaje, buscar un instante equivalente, guardar el desplazamiento y no afirmar coincidencia exacta.

## Generar y comprobar

1. Leer el `request.json` del run e inspeccionar sus cuatro `inputImages`. Identificar por separado entrevistado, presentador, foto del círculo y muestra de estilo.
2. Usar la herramienta integrada de imágenes según `imagegen`, con los cuatro archivos y el prompt. Guardar la salida como `generated-v1.png` en ese run. No copiar `expectedImage` como supuesto resultado nuevo.
3. Inspeccionar el resultado y completar **cada** comprobación de `review.json`: identidades, vestuario, expresión y mirada, círculo, texto/tildes/comillas, legibilidad, composición y retirada de rótulos. Registrar herramienta, commit y fuente usada. `status` será `pass`, `needs_changes` o `blocked`, con razones; el punto de partida es `pending`.
4. Si hay un defecto concreto, corregir ese elemento y conservar lo demás. Guardar `generated-v2.png` y describir el cambio. Después de dos correcciones fallidas sobre el mismo defecto, presentar las versiones y el problema al usuario para decidir cómo seguir.
5. Mostrar referencia y resultado nuevo. La coincidencia de píxeles no es el objetivo de una generación variable: se evalúan las identidades, el texto y los criterios visuales aprobados. No inventar una puntuación ni dar por probada otra PC desde esta.

`humanApproved` queda en `false` hasta que el usuario apruebe explícitamente la nueva versión. Una comprobación técnica favorable no actualiza por sí sola los assets aprobados. Las miniaturas de producciones recientes aún pendientes de valoración no son nuevos patrones aprobados.

## Cómo incorporar una mejora

Si aparece un fallo repetible, conservar el run y documentar: entrada, resultado esperado, diferencia observada, corrección y resultado tras repetir. Hacer la modificación mínima en la fuente `skills/crear-miniaturas/`, sincronizar con `npm run skills:setup` y repetir el caso afectado y el otro caso aprobado. No editar solamente la copia generada de `.agents/skills/` ni convertir una excepción de vestuario o de retratos en una regla para todas las entrevistas.

Los videos completos, candidatos y versiones nuevas quedan locales. Git conserva los dos PNG aprobados, recetas y prompts. Sustituir una referencia aprobada requiere la decisión explícita del usuario; conservar antes la versión anterior.
