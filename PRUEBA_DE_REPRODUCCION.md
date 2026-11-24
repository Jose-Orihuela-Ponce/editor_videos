# Prueba del flujo visual en otro equipo

Objetivo: comprobar que el agente que recibe el repositorio entiende y ejecuta el estilo pulido aquí, y mejorar instrucciones solo cuando aparezca una diferencia demostrada.

La [comprobación local de las recetas](references/thumbnails/COMPROBACION_PORTABILIDAD.md) registra lo probado en esta PC y una corrección real de comillas. El otro equipo debe completar su propia comprobación.

## Material que viaja por Git

| Caso aprobado | Video original | Captura entrevistado | Captura presentadora | Referencia final |
| --- | --- | --- | --- | --- |
| Luis González-Posada | [YouTube](https://www.youtube.com/watch?v=UmrKIdJk9X0) | 13:03 | 13:00 | `skills/crear-miniaturas/assets/approved-01.png` |
| Carlos Bruce | [YouTube](https://www.youtube.com/watch?v=IIUUks5XOWg) | 24:15 | 22:54 | `skills/crear-miniaturas/assets/approved-02.png` |

Se incluyen recetas, prompts históricos y referencias aprobadas. Se excluyen videos completos, descargas, perfiles WebView2, capturas de trabajo y resultados de nuevas pruebas. Los borradores recientes de Fernando Rospigliosi y Roxana Rocha todavía pendientes de valoración no sustituyen estas dos referencias aprobadas.

## Instrucción lista para el agente del otro equipo

> Lee AGENTS.md, AVANCE.md e INSTALACION_EN_OTRA_PC.md. Sin modificar mis datos personales ni subir archivos a Drive, comprueba el entorno y habilita las skills del repositorio. Reproduce approved-01 y approved-02 usando las URLs, capturas y textos de reproduction-cases.json. Usa crear-miniaturas y la herramienta integrada de imágenes disponible en este chat. Guarda una imagen realmente generada para cada caso, compárala con su referencia y completa los review.json con diferencias concretas. Si falta una herramienta o una fuente, registra blocked y conserva los materiales. Si hay un defecto, corrige solo ese elemento y repite; conserva versiones. Muéstrame las comparaciones para decidir si aprobamos el resultado. No sustituyas las referencias aprobadas ni des por hecha una prueba visual que no realizaste.

## Preparación repetible

```powershell
npm run skills:setup
npm run skills:check
npm run doctor
npm run thumbnail:reproduce -- --list
npm run thumbnail:reproduce -- --case approved-01
npm run thumbnail:reproduce -- --case approved-02
```

Si ya existe un original, añadir `--video "RUTA"`. Si hace falta elegir otra foto identificada, añadir `--portrait "RUTA"` y guardar su URL/crédito real en el informe. Cada preparación crea un run nuevo y evita sustituir resultados previos. El helper prepara datos; **el agente todavía tiene que generar e inspeccionar la miniatura**. Leer `skills/crear-miniaturas/references/reproduction.md` antes de hacerlo.

## Criterios de revisión

Las identidades, el vestuario de las capturas elegidas, la expresión/mirada, la persona del círculo y el texto exacto son requisitos. En el segundo caso, la presentadora lleva chaqueta oscura: no copiar la chaqueta blanca de la muestra inicial. El retrato de Rafael López Aliaga conserva camisa de cuello abierto, sin inventar corbata.

Comparar también caras grandes orientadas hacia el centro, círculo superior, flecha curva roja con borde negro, fondo azul, texto blanco muy grueso, degradado inferior suave y legibilidad en móvil. Se admiten ajustes razonables de encuadre y escala. No se exige coincidencia de píxeles entre modelos generativos.

Completar `review.json` con `pass`, `needs_changes` o `blocked` y explicar las diferencias. `humanApproved` permanece falso hasta la respuesta explícita del usuario. Tras dos correcciones fallidas del mismo defecto, presentar el problema y las versiones disponibles.

Si una corrección mejora el caso sin empeorar el otro, integrar una modificación mínima en `skills/`, sincronizar y repetir ambos casos. Conservar el informe y las imágenes locales. Solo una nueva aprobación explícita puede cambiar el patrón visual versionado.
