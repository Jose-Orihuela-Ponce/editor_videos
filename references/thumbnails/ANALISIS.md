# Estilo de miniaturas aprobado

Dos composiciones de prueba y la miniatura de la producción real fueron aprobadas el 22 de noviembre de 2026. La implementación reutilizable está en `skills/crear-miniaturas/`, instalada también como skill personal.

## Referencias conservadas

- `ejemplo_!/`: primer video, enlace, recortes y miniatura aportados por el usuario.
- `ejemplo_2/`: segundo video, enlace y miniatura aportados por el usuario. La chaqueta blanca de esa miniatura puede proceder de otra entrevista, según reconoció el usuario; para cada trabajo se conserva el vestuario del fotograma elegido.
- `skills/crear-miniaturas/assets/approved-01.png`: primera composición aprobada, E1 13:03 y P2 13:00, Carlos Espá en el círculo y «SERÁ INVESTIGADO POR FISCALÍA Y CONTRALORÍA».
- `skills/crear-miniaturas/assets/approved-02.png`: segunda composición aprobada, E1 24:15 y P1 22:54, Rafael López Aliaga en el círculo y «CUANDO PIERDA, NO VA A ACEPTAR SER MI REGIDOR».
- Prompts y comprobaciones de esas pruebas: `.local/evidencias/miniaturas/`. Se retiraron las exploraciones intermedias y los scripts puntuales, sustituidos por el extractor de la skill.

## Criterios acordados

1. Explorar el original y refinar los intervalos con planos grandes de cada participante. Proponer 3–4 opciones E y 3–4 P con ID y tiempo.
2. Priorizar mirada y cabeza ligeramente orientadas hacia el otro participante, ojos abiertos y nitidez. La sensación de diálogo importa más que la intensidad del gesto. Evitar fundidos y conservar manos cuando aporten.
3. El usuario elige una opción de cada grupo. Si pide más, conservar el participante elegido, ampliar la búsqueda del otro y añadir IDs nuevos sin renumerar los anteriores.
4. El usuario aporta contexto, persona o institución de referencia y texto. Pedir el texto si falta y corregirlo con `corregir-textos`; mantener separado el título de publicación. Registrar reformulaciones y citas atribuidas por el usuario sin afirmar un cotejo inexistente.
5. Buscar e inspeccionar la foto de referencia y conservar sus fuentes. Capturas y retratos nuevos tienen prioridad sobre las caras y el vestuario de las muestras.
6. Componer con participantes grandes izquierda/derecha, círculo superior, flecha curva roja de borde negro, texto blanco muy grueso con contorno negro, degradado negro inferior y viñeta. Luckiest Guy o fuente parecida, normalmente dos líneas. Se permite ajustar escala, recorte, disposición y sombreado según el caso.
7. Revisar la imagen real, corregir defectos y mostrarla para aprobación. Los registros quedan locales; a Drive se destinan video y miniatura aprobada.

La skill utiliza el muestreo de FFmpeg y la revisión visual del agente; no es un detector autónomo de expresiones ni está integrada en segundo plano con el render del MP4.

## Producción real: Juan Paredes

Elección del usuario: E4 (05:08) y P2 (02:07). Miniatura aprobada con texto «HAY UNA FRACTURA EN JUNTOS POR EL PERÚ» y un círculo dividido que muestra dos retratos completos: Roberto Sánchez y Ernesto Zunini. Esta disposición doble es una adaptación solicitada para este caso, no una obligación para otras miniaturas.

Se conservan capturas originales, tiempos, retratos con fuentes, prompt y composición en `<trabajo>/thumbnail/`, fuera de Git. La carga real del MP4 y la miniatura se verificó y el usuario confirmó la descarga al teléfono y aprobó el resultado el 23 de noviembre de 2026. Los identificadores y enlaces de entrega quedan locales.

## Procedencia de retratos de ejemplo

- Carlos Espá: [Andina](https://andina.pe/agencia/noticia-elecciones-2026-carlos-espa-propone-crear-cinco-penales-maxima-seguridad-1061084.aspx).
- Rafael López Aliaga: [El Comercio](https://elcomercio.pe/politica/actualidad/rafael-lopez-aliaga-alcalde-de-lima-por-culpa-de-la-corrupcion-no-importaba-que-la-gente-demorara-la-vida-en-transportarse-entrevista-noticia/).
- Los retratos de Roberto Sánchez y Ernesto Zunini para la producción real proceden de páginas del Congreso; las URLs exactas de página e imagen están registradas en su `composition.json`.
