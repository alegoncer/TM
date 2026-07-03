# Scripts Tampermonkey

Repositorio para centralizar scripts de **Tampermonkey** y permitir su instalación y actualización automática desde GitHub.

## Instalación rápida

1. Instala la extensión **Tampermonkey** en el navegador.
2. Abre el enlace de instalación del script que quieras usar.
3. Tampermonkey detectará el archivo `.user.js` y mostrará la pantalla de instalación.
4. Pulsa **Instalar**.

## Scripts disponibles

| Script | Descripción | Instalación |
|---|---|---|
| Neotel PBX - Campañas Coremsa | Mejora la pantalla de campañas de Neotel añadiendo filtros, ordenación, ocultación del panel derecho y secciones colapsables. | [Instalar](https://raw.githubusercontent.com/alegoncer/TM/main/neotel-campanas.user.js) |

## Actualizaciones automáticas

Los scripts se actualizan desde GitHub usando las cabeceras de Tampermonkey:

```js
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/nombre-del-script.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/nombre-del-script.user.js
```

Para publicar una nueva versión:

1. Edita el archivo `.user.js`.
2. Sube los cambios a GitHub.
3. Aumenta el número de versión en la cabecera `@version`.

Ejemplo:

```js
// @version      1.0.1
```

Si no se cambia `@version`, Tampermonkey puede no detectar la actualización correctamente.

## Cabecera recomendada

Cada script debería empezar con una cabecera similar a esta:

```js
// ==UserScript==
// @name         Nombre del script
// @namespace    https://github.com/alegoncer/TM
// @version      1.0.0
// @description  Breve descripción de lo que hace el script
// @author       Alejandro
// @match        https://dominio-donde-funciona/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/nombre-del-script.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/nombre-del-script.user.js
// @supportURL   https://github.com/alegoncer/TM/issues
// ==/UserScript==
```

## Estructura recomendada

```text
/
├── README.md
├── neotel-campanas.user.js
└── otros-scripts.user.js
```

Usar siempre nombres claros, sin espacios ni tildes:

```text
neotel-campanas.user.js
inno-visor-adjuntos.user.js
cardmarket-export-csv.user.js
```

## Buenas prácticas

- Usar siempre la extensión `.user.js`.
- Mantener una cabecera completa y bien formateada.
- Cambiar `@version` cada vez que se publique una actualización.
- Evitar subir archivos de prueba, copias locales o versiones temporales.
- No incluir contraseñas, tokens, claves privadas ni datos personales.
- Revisar que los enlaces `@updateURL` y `@downloadURL` apunten a la rama `main`.

## Seguridad

Este repositorio puede ser público o privado según el nivel de exposición deseado.

Si el repositorio es público, cualquier persona con el enlace puede ver el código de los scripts. No debe incluirse información sensible.

## Soporte

Para incidencias, mejoras o dudas, usar la sección de issues del repositorio:

https://github.com/alegoncer/TM/issues
