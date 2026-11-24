# Referencias de miniaturas

Las carpetas `ejemplo_!/` y `ejemplo_2/` conservan las muestras originales aportadas por el usuario. Los dos resultados aprobados que sirven de referencia visual están en `skills/crear-miniaturas/assets/`.

Las carpetas `ejemplo_*/` se excluyen de Git: permanecen en el equipo y no se incluyen al clonar. El repositorio conserva la configuración, el análisis, el extractor y los dos resultados aprobados; no necesita los MP4 originales para compilar o ejecutar las pruebas.

Para volver a producir esos resultados en otra PC, consultar `PRUEBA_DE_REPRODUCCION.md` y `skills/crear-miniaturas/references/reproduction-cases.json`: contienen URLs de YouTube, tiempos del original, textos, referencias de retratos y prompts históricos. `npm run thumbnail:reproduce -- --case approved-01` prepara materiales locales para que el agente genere y compare una miniatura nueva. Preparar materiales no equivale a superar la revisión visual.

La skill personal `crear-miniaturas` tiene su fuente mantenida en `skills/crear-miniaturas/`: instrucciones, extractor con IDs persistentes, referencias aprobadas y configuración empaquetada. `style.json` conserva la configuración del proyecto; sincronizar ambas configuraciones al cambiar el diseño aprobado.

`ANALISIS.md` resume los criterios validados y la producción real. Se retiraron las exploraciones y scripts puntuales que ya sustituye el extractor de la skill; sus comprobaciones pequeñas permanecen en `.local/evidencias/miniaturas/`.

Antes de componer se necesitan elección de capturas, contexto, referencia visual y texto exacto. Si falta el texto, preguntar. La generación sigue un flujo por conversación independiente de la edición del MP4. El título de publicación se corrige aparte.
