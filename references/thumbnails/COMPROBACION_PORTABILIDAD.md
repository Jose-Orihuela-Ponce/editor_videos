# Comprobación de las recetas de reproducción

23 de noviembre de 2026. Ejecutada en la PC actual sobre los cambios locales de portabilidad. No demuestra por sí sola el funcionamiento de otra PC.

## Qué se comprobó

- Las dos skills pasan el validador y se habilitan desde `skills/` en copias locales descubiertas por repositorio, sin copiar el perfil personal.
- El sincronizador se probó ante instalación inicial, actualización y modificaciones locales; protege cambios ajenos en lugar de sobrescribirlos.
- Se descargaron de nuevo ambos videos públicos mediante el helper, sin cookies, configuración personal de yt-dlp ni entrega a Drive. Las cuatro capturas obtenidas en los instantes de las recetas se inspeccionaron y corresponden a las elecciones originales.
- Se generó una imagen nueva por ejemplo con la herramienta integrada y se revisó contra la referencia aprobada. Los originales y los PNG aprobados permanecieron intactos.

## Diferencia encontrada y corrección

El primer caso omitió las comillas aunque estaban dentro del texto del prompt. Se conservó esa primera versión y se corrigió únicamente la puntuación. El prompt del helper ahora pide explícitamente una comilla de apertura antes de la primera palabra y una de cierre tras la última, aclarando que son glifos que deben imprimirse y reservar espacio.

La versión corregida mantuvo personas, ropa, círculo, flecha y palabras. El segundo caso, ya con la indicación reforzada, conservó las comillas, la chaqueta oscura de la presentadora y la camisa de cuello abierto del retrato. La revisión visual técnica fue favorable; las nuevas imágenes no se declararon aprobadas por el usuario ni sustituyeron los patrones.

## Evidencias y límite

Los runs, imágenes generadas e informes completos están en `.local/reproductions/` y se excluyen de Git. `portability-summary.json` señala qué runs tienen generación revisada y cuáles solo preparación de capturas. El otro equipo deberá generar sus propias imágenes y completar sus informes usando `PRUEBA_DE_REPRODUCCION.md`.

Las variaciones de encuadre, escala o textura de una generación no justifican afirmar igualdad de píxeles. Se evalúan los requisitos visuales declarados. Tampoco se declara probada una instalación nueva de Tauri o una autorización de Drive en la segunda PC.
