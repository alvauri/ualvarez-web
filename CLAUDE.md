# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Landing estática de ualvarez (consultoría en webs, procesos y automatizaciones, Rosario). HTML, CSS y JavaScript sin frameworks, sin dependencias y sin paso de build. Todo el contenido está en español rioplatense con voseo ("escribime", "contame"); los mensajes de commit también van en español.

Netlify publica `main` en https://www.ualvarez.com.ar (el dominio sin `www` redirige ahí). Cada PR genera una vista previa en `https://deploy-preview-<número>--ualvarez-web.netlify.app`.

## Cómo verlo y probarlo

- No hay build, linter ni tests en el repo. Para ver la página alcanza con abrir `index.html` o servir la carpeta (`python3 -m http.server`).
- Las cabeceras de `_headers` (incluida la Content-Security-Policy) solo se aplican en Netlify: abriendo los archivos en local no se prueban. Para probar la CSP hay que servir la carpeta con un servidor que agregue esas cabeceras.
- En producción aparece un aviso de CSP por un script inline que inyecta Netlify (`/.netlify/scripts/hud`). No es del sitio; no hay que aflojar la política por eso.

## Arquitectura

- **Páginas:** `index.html` (inicio) y `privacidad.html` (política de privacidad según la Ley 25.326). Cada una enlaza `assets/css/base.css` y después tiene un `<style>` con solo sus estilos propios.
- **`assets/css/base.css`** es el sistema de diseño compartido: variables en `:root` y los componentes que usan las dos páginas (base, foco, `.oculto`, `.saltar`, `.wrap`, títulos, `.etiqueta`, `.chip`, botones, `.encabezado`/`.marca`, pie). Lo que se repite entre páginas va acá, no copiado en cada `<style>`.
- **JavaScript:**
  - `assets/js/js-activo.js` se carga sin `defer` en el `<head>` y agrega la clase `js` a `<html>`. El CSS del menú para celular depende de esa clase: con `.js` muestra el botón «Menú»; sin JavaScript (`html:not(.js)`) muestra las secciones en una fila debajo del logo.
  - `assets/js/sitio.js` (con `defer`, solo en `index.html`) maneja el menú para celular (`aria-expanded` en `.menu-boton`, clase `.abierto` en `#menu`; se cierra con cualquier enlace del encabezado, Escape, clic afuera, foco que sale del encabezado o al pasar a escritorio) y el botón «Copiar el email».
- **Imágenes:** la marca está en `assets/marca/` (SVG con los mismos colores que las variables). Las capturas del portfolio están en `assets/trabajos/` en WebP de 960×600, con `loading="lazy"`, `width`/`height` y texto alternativo descriptivo.

## Reglas del sistema de diseño

- Usar siempre las variables de `base.css`: colores (`--tinta`, `--papel`, `--violeta`…), tamaños de letra (`--texto-etiqueta` a `--texto-display`), espaciado (`--e-1` 4px a `--e-9` 96px), radios (`--radio-chico`, `--radio-tarjeta`, `--radio-pildora`), `--sombra` y `--transicion`. No escribir colores hexadecimales fuera de `:root` (salvo `theme-color` en el `<head>`). El relleno interno de botones y chips es la única excepción a la escala de espaciado.
- Puntos de corte: solo 400, 560, 760 y 900 px (están anotados al principio de `base.css` porque las variables no funcionan dentro de `@media`).
- Botones: `.boton` más `.boton-principal` (violeta) o `.boton-secundario` (borde); `.boton-chico` para el encabezado.
- `.etiqueta` sola es el texto en mayúsculas que va arriba de un título. Combinada con `.chip` («Demo») o `.numero` (numeración de servicios) se usa en línea.
- Las secciones oscuras llevan la clase `.oscuro`, que ajusta el color de foco y de las etiquetas.

## Seguridad

`_headers` define una CSP estricta: `script-src 'self'`, así que **no se pueden agregar scripts inline ni atributos `onclick`/`on*`**: todo el JavaScript va en archivos de `assets/js/`. Los estilos inline sí están permitidos. Cualquier recurso de un dominio nuevo (fuentes, imágenes, analítica, un formulario) necesita agregarse a la directiva correspondiente de la CSP; hoy solo están permitidos Google Fonts (`fonts.googleapis.com` y `fonts.gstatic.com`).

Si se suma algo que recibe o registra datos de visitantes (un formulario, estadísticas, cookies), hay que actualizar también `privacidad.html` y su fecha de «Última actualización»: la política dice explícitamente que el sitio no tiene formularios, cookies ni seguimiento.

## Accesibilidad (WCAG 2.1 AA)

El sitio pasa axe-core sin errores; mantenerlo así:
- Botones y enlaces de al menos 44 px de alto (incluido el logo).
- Contrastes de texto ≥ 4,5:1; los valores medidos están comentados junto a cada color en `base.css`.
- Enlaces con `target="_blank"` llevan `rel="noopener noreferrer"` y un `<span class="oculto"> (se abre en otra pestaña)</span>`.
- Lo decorativo va con `aria-hidden="true"`; las animaciones respetan `prefers-reduced-motion`.
- La página no debe desbordar horizontalmente a 320 px.

## Proyectos relacionados

Los trabajos del portfolio viven en otros repositorios: `alvauri/calzadospro-web` (sitio estático) y `alvauri/portal-clientes` (demo con Supabase en https://ualvarez-portal.netlify.app). El portal todavía usa otra paleta (índigo y fuente del sistema), no la de ualvarez.
