# Continuidad

- Leer `AVANCE.md` al comenzar: contiene el estado real, comprobaciones y siguiente paso.
- Seguir `Editor de video ligero plan del proyecto.md`. Implementar solo la etapa autorizada.
- Si una petición corresponde a una etapa posterior, indicarle al usuario cuál es y dejarla registrada para esa etapa; no adelantar su implementación sin autorización.
- Mantener `AVANCE.md` corto y actualizado al terminar cada sesión.
- Para actualizar o instalar en otro equipo, leer `INSTALACION_EN_OTRA_PC.md` y `PRUEBA_DE_REPRODUCCION.md`. Después de obtener commits, ejecutar `npm run skills:setup` y `npm run skills:check`; las fuentes mantenidas son `skills/`, y `.agents/skills/` contiene copias locales generadas. Conservar cambios locales al sincronizar.
- Para comprobar el estilo visual, usar los dos casos aprobados de `skills/crear-miniaturas/references/reproduction-cases.json`. Guardar nuevas pruebas en `.local/reproductions/`, comparar imágenes reales y completar los informes. No convertir preparar capturas o pasar tests en una supuesta aprobación visual ni afirmar que otra PC fue probada desde aquí.
- Interfaz en español; código e identificadores en inglés.
- Verificar persistencia e historial cuando se cambien. No confundir la vista web con la aplicación Tauri.

## Flujo de producción

- Al recibir un enlace para procesar, pedir el nombre corto de referencia si el usuario aún no lo dio. Usarlo en `--reference` para identificar la subcarpeta de Drive. El nombre referencial, el texto de miniatura y el título de publicación tienen funciones distintas.
- La entrega prevista en Drive es `Ediciones/<nombre de referencia>/`, con el video y, posteriormente, la miniatura. Los registros del trabajo se guardan localmente.
- La conexión de Drive se configura en `.env`, a partir de las variables de `.env.example`. Conservar las credenciales fuera de las respuestas y de Git.
- Para corregir un título o una frase, usar `corregir-textos`, con fuente en `skills/corregir-textos/`. El usuario propone el texto y recibe la corrección lista para copiar. La skill verifica nombres dudosos de figuras públicas con contexto peruano.
- Para miniaturas, mostrar candidatos y esperar la elección de un fotograma por participante. El usuario aporta el contexto y la persona o institución de referencia; buscar su imagen en internet y conservar la fuente. Pedir siempre el texto de miniatura si aún no lo ha dado, antes de componer. Mantener separados ese texto y el título de publicación; registrar si se trata de una reformulación del usuario.
- Usar la skill personal `crear-miniaturas` para ese flujo; su fuente mantenida en el proyecto es `skills/crear-miniaturas/`. Permitir nuevas rondas con IDs nuevos y conservar la selección del participante que el usuario quiera mantener. La skill y sus capturas son independientes del render del MP4.
