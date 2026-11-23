---
name: verificar-sitio
description: Verifica el sitio de ualvarez con un solo comando, tal como quedaría publicado en Netlify. Revisa accesibilidad con axe-core, la Content-Security-Policy de _headers, errores de JavaScript, desborde horizontal de 320 a 1440 px, objetivos táctiles de 44 px, el menú para celular (con y sin JavaScript) y el botón «Copiar el email». Opcionalmente compara capturas de antes y después contra main y revisa las cabeceras en producción. Usala siempre después de tocar cualquier HTML, CSS, JavaScript, imagen o _headers de este repo y antes de commitear o abrir un PR, aunque el cambio parezca chico. También cuando pidan «verificá el sitio», «probá la página», «¿está todo bien?», «¿se rompió algo?» o «fijate que ande en el celular», o después de aceptar un PR, para confirmar producción.
---

# Verificar el sitio

El sitio no tiene tests ni build. Estas verificaciones son las que mantienen lo que ya se logró: cero errores de axe-core, una CSP estricta sin bloqueos, nada que se desborde a 320 px y un menú para celular que se puede usar con el dedo, con el teclado y sin JavaScript. Un cambio chico de CSS puede romper cualquiera de esas cosas sin que se note a simple vista, por eso conviene correrlas siempre.

## Cómo correrlo

Desde la raíz del repo:

```bash
node .claude/skills/verificar-sitio/scripts/verificar.js
```

Opciones:

| Opción | Cuándo usarla |
|---|---|
| `--comparar origin/main` | Cuando el cambio toca cómo se ve la página (CSS, HTML, imágenes). Saca capturas a 390 y 1440 px de la rama indicada y de lo actual, y arma imágenes lado a lado. Antes hacé `git fetch origin main` para comparar contra lo último. |
| `--produccion` | Después de que se acepta un PR, o cuando preguntan si la web publicada anda. Compara las cabeceras de www.ualvarez.com.ar con `_headers` y busca bloqueos de CSP y errores en la página publicada. Netlify tarda uno o dos minutos en publicar: si las cabeceras no coinciden justo después de aceptar el PR, esperá y volvé a correrlo. |
| `--salida DIR` | Para elegir dónde quedan el informe y las capturas (si no, va a una carpeta temporal que el script informa al final). Usá el scratchpad de la sesión. |

Tarda unos 30 segundos y sale con código 0 si todo pasa y 1 si algo falla. La primera vez descarga axe-core a `~/.cache/verificar-sitio`.

## Qué revisa y por qué

- **Accesibilidad (axe-core):** reglas WCAG 2.1 A/AA y buenas prácticas, en cada `.html` de la raíz.
- **Content-Security-Policy local:** sirve la carpeta con las cabeceras de `_headers`, como Netlify. Cualquier script inline, atributo `on*` o recurso de un dominio no permitido aparece acá antes de llegar a producción.
- **Errores de JavaScript** al cargar cada página.
- **Desborde horizontal** en 10 anchos, de 320 a 1440 px.
- **Objetivos táctiles:** botones y enlaces visibles de al menos 44 px de alto a 320 y 390 px. Los enlaces dentro de una oración quedan exceptuados, como permite WCAG.
- **Menú para celular** (en las páginas que lo tienen), en un iPhone 13 simulado:
  - Se abre al tocar «Menú» y con Enter.
  - Se cierra al elegir una sección, al tocar «Escribime», con Escape (y el foco vuelve al botón), al tocar afuera y cuando el foco del teclado sale del encabezado.
  - Sin JavaScript, las secciones siguen visibles.
- **Copiar el email:** el aviso dice «Email copiado.».

## Cómo leer el resultado

El script imprime un informe en Markdown (y lo guarda en `informe.md` dentro de la carpeta de salida) con ✅ o ❌ por verificación y el detalle de cada falla.

- **❌ en CSP local:** casi siempre es un `<script>` escrito dentro del HTML o un `onclick`. La solución es mover el código a `assets/js/`, no aflojar la política. Si el cambio necesita un dominio nuevo (fuentes, analítica, un formulario), hay que agregarlo a la directiva que corresponde en `_headers`. Si el dominio recibe datos de visitantes, también hay que actualizar `privacidad.html`.
- **❌ en objetivos táctiles:** el informe dice qué elemento y su tamaño. Se arregla con `min-height: 44px` o más relleno, usando las variables de `base.css`.
- **❌ en desborde:** el informe dice desde qué ancho se desborda. Suele ser un ancho fijo en px o un texto largo sin cortar.
- **Capturas «distinta»:** no es una falla. Si el alto no cambió y el porcentaje de píxeles distintos es muy bajo (alrededor de 0,2 % o menos) en una página que no tocaste, suele ser ruido del suavizado de las fuentes: confirmalo mirando la imagen lado a lado. Un cambio real de una palabra también mueve pocos píxeles, pero concentrados en un lugar. Mirá las imágenes `lado-*.png` (antes a la izquierda, después a la derecha) y confirmá que los cambios sean los buscados. Si la diferencia no era intencional, investigala.
- **En producción,** el script bloquea a propósito `/.netlify/scripts/hud`, el script que inyecta Netlify, porque siempre dispara un aviso de CSP que no es del sitio.

## Cómo contarle el resultado al usuario

En español rioplatense y en pocas líneas: si pasó todo, cuántas verificaciones corrieron. Si algo falló, qué falló, por qué importa para un visitante y qué vas a hacer. No pegues el informe entero. Si comparaste capturas y hay diferencias, mostrale una imagen lado a lado de la parte que cambió.
