# Avance

Actualizado: 23 de noviembre de 2026.

## Estado y continuación

- Editor manual y producción desde el chat separados, con motor compartido de estilos, geometría, textos y exportación. Etapas 1–6 implementadas; Whisper sigue futuro y opcional.
- Entrada: `scripts/process-link.mjs`; entrega y reintentos: `scripts/upload-drive.mjs`; autorización local: `scripts/authorize-drive.mjs --credentials RUTA_JSON`. Guía operativa: `Flujo automatico de enlace a video editado.md`.
- Las skills de miniaturas y corrección funcionan por conversación. Fuentes del proyecto en `skills/crear-miniaturas/` y `skills/corregir-textos/`. La miniatura es independiente del MP4.

## Portabilidad preparada

- El usuario autorizó preparar el flujo completo para la otra PC, que aún conserva la versión Manual/Automático. Leer **INSTALACION_EN_OTRA_PC.md** y **PRUEBA_DE_REPRODUCCION.md** después de actualizar el repositorio.
- `npm run skills:setup` habilita las dos skills en `.agents/skills/` desde las fuentes del proyecto; `skills:check` detecta actualizaciones. No se copia el perfil personal y el sincronizador protege modificaciones locales. Repetir tras obtener commits.
- `npm run doctor` comprueba dependencias y copias de skills. WebView2, herramientas del chat y comportamiento visual de Tauri se verifican aparte. En la migración usar `--executable` con el ejecutable recién compilado para evitar una copia automática antigua.
- `references/production/horizontal.json` conserva una copia del estilo de estas pruebas, sin rutas ni credenciales. Usarla en datos aislados, sin sobrescribir los estilos del otro equipo.
- Dos recetas aprobadas con URLs, tiempos, textos, fuentes, PNG y prompts históricos en `skills/crear-miniaturas/references/`. `npm run thumbnail:reproduce -- --case approved-01` o `approved-02` prepara capturas y una petición para generar/revisar otra miniatura; no entrega a Drive.
- Se comprobaron aquí ambas descargas nuevas desde YouTube y sus capturas. Se generaron dos reproducciones nuevas y se revisaron; la primera omitió comillas, se corrigió solo esa parte y se reforzó el prompt del helper. Revisión técnica favorable, sin sustituir patrones ni simular aprobación del usuario. Informe público: `references/thumbnails/COMPROBACION_PORTABILIDAD.md`; imágenes e informes en `.local/reproductions/`.
- Cierre del repositorio: **81 pruebas en 19 archivos y 17 pruebas Rust correctas**, compilación web, sincronización de skills y doctor correctos. Incluye persistencia, historial y exportaciones. Revisión de secretos en archivos, índice e historial sin hallazgos; inventario publicable de 163 archivos, sin videos completos ni adjuntos.
- `.codex-attachments/` excluido tras detectar la foto del último trabajo como archivo nuevo; el control rechaza también adjuntos y medios completos añadidos a la fuerza. Los PNG aprobados permanecen publicables. Credenciales y producciones privadas se conservan localmente.
- Este cierre reúne producción, seguridad y portabilidad en un **commit local; sin push**. No se ha instalado ni probado físicamente la otra PC; su agente debe generar y revisar resultados propios.

## Producciones conservadas

- **Marco Vinelli**: enlace `dYk4DuDJyz4`, «Mi estilo» horizontal; MP4 de 36:29,77, H.264/AAC, 834 × 470 y 230.063.939 bytes. Decodificación completa, tres fotogramas y MD5 local/remoto comprobados; Drive `verified` y descarga disponible, reproducción en línea aún procesándose al consultar. Registro privado: `.local/produccion/marco-vinelli.json`. Miniatura E4 + P2 con «Cuando llegamos, no encontramos avances» y foto de rescate en inundación aportada por el usuario, centrada en el círculo. Versión 1 generada y revisada, pendiente de valoración; sin subir a Drive.
- **Roxana Rocha**: MP4 de 15:04,17, H.264/AAC, 834 × 470 y 131.028.825 bytes; decodificación completa y tres fotogramas comprobados, Drive `verified`. Registro privado en `.local/produccion/roxana-rocha.json`. Miniatura E1 + P2 con Rafael López Aliaga y «Hay que cambiar la ley electoral», generada y revisada; pendiente de valoración antes de añadirla a Drive. Título corregido: **Diputada Roxana Rocha sobre el JNE**.
- **Fernando Rospigliosi**: MP4 de 25:58,59, H.264/AAC, 834 × 470 y 138.570.426 bytes; decodificado y Drive `verified`. Registro privado en `.local/produccion/fernando-rospigliosi.json`. Se recuperó una interrupción usando el original, filtro y texto de Tauri, sin descargar de nuevo. Miniatura E2 + P1 con Carlos Espá y «Estamos evaluando a Carlos Espá», pendiente de valoración. Título corregido: **Senador Fernando Rospigliosi sobre Carlos Espá**.
- Las dos miniaturas recientes son borradores; no se convierten en referencias aprobadas. Sus fuentes, prompts y hashes permanecen en cada trabajo y en `.local/produccion/`. La disponibilidad de reproducción en Drive se consulta por separado de la transferencia ya verificada.
- **Juan Paredes**: prueba real completa aprobada, con video y miniatura entregados y descarga móvil confirmada. Rutas y enlaces privados conservados en `.local/revision-github/avance-antes.md` y `flujo-antes.md`.

## Pendientes y decisiones vigentes

- Procesamiento de videos cerrado por ahora. Marco Vinelli: título corregido **Ministro Marco Vinelli sobre el fenómeno de El Niño**; miniatura E4 + P2 con foto aportada guardada, sin aprobación explícita de subida. Conservar separados referencia, texto de miniatura y título de publicación. Siguiente paso del repo: publicar el commit local cuando el usuario solicite la subida; después seguir `INSTALACION_EN_OTRA_PC.md` en el otro equipo.
- Mantener OAuth en **Pruebas** por decisión del usuario. No se cambió Google Console; el usuario pasará después a producción y reautorizará. El refresh token de Drive de una app externa en Pruebas caduca a los siete días desde el consentimiento; reautorizar y reintentar la entrega existente sin repetir edición.
- `.env` conserva las credenciales fuera de Git y de las respuestas. No hay cargas ni procesos de autorización pendientes. La revisión de seguridad es preventiva con reglas limitadas.
- Lectura de JSON con reintentos acotados ante bloqueos transitorios Windows/OneDrive comprobada; no oculta datos corruptos ni bloqueos persistentes.
- Incidencias heredadas pendientes de reproducir en Tauri: guardado desde copias desactualizadas, vista previa con audio faltante, arrastre en modo libre, pausa al guardar y MP3 con imagen faltante. No se declaran resueltas por esta preparación.
