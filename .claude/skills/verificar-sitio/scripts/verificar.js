#!/usr/bin/env node
// Verifica el sitio de ualvarez: accesibilidad, menú para celular, desborde, objetivos táctiles,
// Content-Security-Policy (sirviendo la carpeta con las cabeceras de _headers) y, opcionalmente,
// capturas de antes y después contra una rama y las cabeceras en producción.
//
// Uso (desde la raíz del repo):
//   node .claude/skills/verificar-sitio/scripts/verificar.js [--comparar origin/main] [--produccion] [--url DIRECCIÓN] [--salida DIR]
//   --url revisa otra dirección publicada (por ejemplo https://ualvarez-web.pages.dev) en lugar de www.ualvarez.com.ar.
//
// Sale con código 1 si alguna verificación falla. Escribe un resumen en Markdown por la salida estándar.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

// ---------- argumentos ----------
const args = process.argv.slice(2);
const opcion = (nombre) => { const i = args.indexOf(nombre); return i === -1 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
// path.resolve: en Windows git devuelve la ruta con «/» y el servidor local la compara con «\».
const RAIZ = path.resolve(execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim());
const COMPARAR = opcion('--comparar');
const URL_OTRA = typeof opcion('--url') === 'string' ? opcion('--url').replace(/\/+$/, '') : null;
const PRODUCCION = !!opcion('--produccion') || !!URL_OTRA;
const SALIDA = typeof opcion('--salida') === 'string' ? path.resolve(opcion('--salida')) : fs.mkdtempSync(path.join(os.tmpdir(), 'verificar-sitio-'));
const URL_PRODUCCION = URL_OTRA || 'https://www.ualvarez.com.ar';
fs.mkdirSync(SALIDA, { recursive: true });

// ---------- dependencias ----------
// Busca Playwright completo; si solo está playwright-core (como en la compu del dueño), usa el Chrome instalado.
let playwright; let canal = null;
for (const modulo of ['playwright', '/opt/node-tools/node_modules/playwright', path.join(os.homedir(), '.cache', 'verificar-sitio', 'node_modules', 'playwright-core')]) {
  try { playwright = require(modulo); if (modulo.endsWith('playwright-core')) canal = 'chrome'; break; } catch { /* probar el siguiente */ }
}
if (!playwright) throw new Error('Falta Playwright: npm install --prefix ~/.cache/verificar-sitio playwright-core');
const { chromium, devices } = playwright;

function cargarAxe() {
  const cache = path.join(os.homedir(), '.cache', 'verificar-sitio');
  const archivo = path.join(cache, 'node_modules', 'axe-core', 'axe.min.js');
  if (!fs.existsSync(archivo)) {
    fs.mkdirSync(cache, { recursive: true });
    execSync('npm install --silent --no-audit --no-fund --prefix . axe-core@4.10.2', { cwd: cache, stdio: 'ignore' });
  }
  return fs.readFileSync(archivo, 'utf8');
}
const AXE = cargarAxe();

// ---------- resultados ----------
const resultados = []; // { grupo, nombre, ok, detalle }
const anotar = (grupo, nombre, ok, detalle = '') => resultados.push({ grupo, nombre, ok, detalle });

// ---------- servidor local con las cabeceras de _headers ----------
function leerCabeceras(dir) {
  const h = {};
  const archivo = path.join(dir, '_headers');
  if (!fs.existsSync(archivo)) return h;
  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    const m = linea.match(/^\s+([\w-]+):\s*(.+)$/);
    if (m) h[m[1]] = m[2].trim();
  }
  return h;
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
function servir(dir) {
  const cabeceras = leerCabeceras(dir);
  return new Promise((resolver) => {
    const servidor = http.createServer((pedido, respuesta) => {
      let ruta = decodeURIComponent(pedido.url.split('?')[0]);
      if (ruta.endsWith('/')) ruta += 'index.html';
      const archivo = path.join(dir, path.normalize(ruta));
      if (!archivo.startsWith(dir)) { respuesta.writeHead(403); return respuesta.end(); }
      fs.readFile(archivo, (error, datos) => {
        if (error) { respuesta.writeHead(404); return respuesta.end(); }
        respuesta.writeHead(200, { ...cabeceras, 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
        respuesta.end(datos);
      });
    });
    servidor.listen(0, '127.0.0.1', () => resolver({ servidor, base: `http://127.0.0.1:${servidor.address().port}`, cabeceras }));
  });
}

const PAGINAS = fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html')).sort();
const ANCHOS = [320, 360, 375, 390, 400, 414, 430, 760, 1024, 1440];
const SIN_ANIMACION = '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}';

// Abre una página y junta violaciones de CSP y errores de JavaScript.
async function abrir(contexto, url, { bloquearHud = false } = {}) {
  const pagina = await contexto.newPage();
  const csp = []; const errores = [];
  pagina.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text().slice(0, 200)); });
  pagina.on('pageerror', (e) => errores.push(e.message));
  if (bloquearHud) await pagina.route('**/.netlify/scripts/hud**', (r) => r.abort());
  await pagina.goto(url, { waitUntil: 'load' });
  await pagina.waitForTimeout(600);
  return { pagina, csp, errores };
}

async function verificarLocal(navegador, base) {
  // 1. Accesibilidad, CSP y errores de JavaScript en cada página
  for (const archivo of PAGINAS) {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const { pagina, csp, errores } = await abrir(contexto, `${base}/${archivo}`);
    // Los avisos de CSP se copian antes de cargar axe: axe mismo se inyecta como script
    // y descarga las hojas de estilo externas, y eso dispararía avisos que no son del sitio.
    const cspDelSitio = [...csp];
    await pagina.evaluate(AXE); // evaluate no pasa por la CSP de la página
    const axe = await pagina.evaluate(async () => {
      const r = await window.axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] });
      return r.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    });
    anotar('Accesibilidad (axe-core)', archivo, axe.length === 0, axe.join('\n'));
    anotar('Content-Security-Policy local', archivo, cspDelSitio.length === 0, cspDelSitio.join('\n'));
    anotar('Errores de JavaScript', archivo, errores.length === 0, errores.join('\n'));
    await contexto.close();
  }

  // 2. Desborde horizontal y objetivos táctiles
  for (const archivo of PAGINAS) {
    const anchos = [];
    for (const ancho of ANCHOS) {
      const contexto = await navegador.newContext({ viewport: { width: ancho, height: 800 } });
      const pagina = await contexto.newPage();
      await pagina.goto(`${base}/${archivo}`);
      if (await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) anchos.push(ancho);
      await contexto.close();
    }
    anotar('Desborde horizontal (320–1440 px)', archivo, anchos.length === 0, anchos.length ? `Se desborda en: ${anchos.join(', ')} px` : '');

    const chicos = [];
    for (const ancho of [320, 390]) {
      const contexto = await navegador.newContext({ viewport: { width: ancho, height: 800 }, hasTouch: true, isMobile: true });
      const pagina = await contexto.newPage();
      await pagina.goto(`${base}/${archivo}`);
      const lista = await pagina.evaluate(() => [...document.querySelectorAll('a, button')]
        .filter((e) => e.offsetParent !== null && !e.classList.contains('saltar'))
        // Excepción de WCAG: un enlace dentro de una oración no necesita 44 px.
        .filter((e) => !(getComputedStyle(e).display === 'inline' && e.parentElement.textContent.trim() !== e.textContent.trim()))
        .map((e) => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) }; })
        .filter((x) => x.h < 44 || x.w < 24));
      lista.forEach((x) => chicos.push(`${ancho} px: «${x.t}» ${x.w}×${x.h}`));
      await contexto.close();
    }
    anotar('Objetivos táctiles ≥ 44 px', archivo, chicos.length === 0, chicos.join('\n'));
  }

  // 3. Menú para celular (solo páginas que lo tienen)
  for (const archivo of PAGINAS) {
    const contexto = await navegador.newContext({ ...devices['iPhone 13'] });
    const { pagina } = await abrir(contexto, `${base}/${archivo}`);
    if (!(await pagina.$('.menu-boton'))) { await contexto.close(); continue; }
    const abierto = () => pagina.evaluate(() => document.querySelector('.menu-boton').getAttribute('aria-expanded') === 'true'
      && getComputedStyle(document.getElementById('menu')).display !== 'none');
    const fallas = [];
    const caso = async (nombre, accion, esperado) => {
      await accion(); await pagina.waitForTimeout(150);
      if ((await abierto()) !== esperado) {
        fallas.push(nombre);
        // Se deja el menú en el estado esperado para que una falla no arrastre a las pruebas siguientes.
        await pagina.evaluate((e) => { document.querySelector('.menu-boton').setAttribute('aria-expanded', String(e)); document.getElementById('menu').classList.toggle('abierto', e); }, esperado);
      }
    };
    await caso('se abre al tocar «Menú»', () => pagina.tap('.menu-boton'), true);
    await caso('se cierra al elegir una sección', () => pagina.tap('#menu a'), false);
    await caso('se abre de nuevo', () => pagina.tap('.menu-boton'), true);
    await caso('se cierra al tocar «Escribime»', () => pagina.tap('.encabezado a.boton'), false);
    await pagina.evaluate(() => window.scrollTo(0, 0));
    await caso('se abre con Enter', async () => { await pagina.focus('.menu-boton'); await pagina.keyboard.press('Enter'); }, true);
    await caso('se cierra con Escape', () => pagina.keyboard.press('Escape'), false);
    if (!(await pagina.evaluate(() => document.activeElement && document.activeElement.classList.contains('menu-boton')))) fallas.push('el foco vuelve al botón después de Escape');
    await caso('se abre otra vez', () => pagina.tap('.menu-boton'), true);
    await caso('se cierra al tocar afuera', () => pagina.mouse.click(200, 600), false);
    await caso('se abre para probar Tab', async () => { await pagina.focus('.menu-boton'); await pagina.keyboard.press('Enter'); }, true);
    await caso('se cierra cuando el foco sale del encabezado', async () => { for (let i = 0; i < 8; i++) await pagina.keyboard.press('Tab'); }, false);
    anotar('Menú para celular', `${archivo} (iPhone 13)`, fallas.length === 0, fallas.length ? `Falló: ${fallas.join('; ')}` : '');
    await contexto.close();

    // Sin JavaScript, las secciones tienen que seguir visibles.
    const sinJs = await navegador.newContext({ ...devices['iPhone 13'], javaScriptEnabled: false });
    const p2 = await sinJs.newPage();
    await p2.goto(`${base}/${archivo}`);
    const visibles = await p2.evaluate(() => [...document.querySelectorAll('#menu a')].filter((a) => a.offsetParent !== null).length);
    const total = await p2.evaluate(() => document.querySelectorAll('#menu a').length);
    anotar('Menú para celular', `${archivo} sin JavaScript`, visibles === total && total > 0, `${visibles} de ${total} secciones visibles`);
    await sinJs.close();
  }

  // 4. Botón «Copiar el email»
  for (const archivo of PAGINAS) {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const { pagina } = await abrir(contexto, `${base}/${archivo}`);
    if (await pagina.$('#copiar')) {
      await pagina.click('#copiar');
      await pagina.waitForTimeout(300);
      const aviso = (await pagina.textContent('#aviso')).trim();
      anotar('Copiar el email', archivo, aviso === 'Email copiado.', `Aviso: «${aviso}»`);
    }
    await contexto.close();
  }
}

// ---------- capturas de antes y después ----------
async function capturar(navegador, base, carpeta, dir = RAIZ) {
  fs.mkdirSync(carpeta, { recursive: true });
  // Solo las páginas que existen en esa versión: una página nueva figura como «nueva» en la comparación.
  for (const archivo of PAGINAS.filter((f) => fs.existsSync(path.join(dir, f)))) for (const ancho of [390, 1440]) {
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
    const pagina = await contexto.newPage();
    await pagina.goto(`${base}/${archivo}`);
    await pagina.addStyleTag({ content: SIN_ANIMACION });
    // Esperar a que carguen las fuentes: si no, el texto puede salir con la fuente de reemplazo
    // en una captura y con Space Grotesk en la otra, y la comparación marca diferencias falsas.
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: path.join(carpeta, `${archivo.replace('.html', '')}-${ancho}.png`), fullPage: true });
    await contexto.close();
  }
}

function compararCapturas(antes, despues, salida) {
  // Usa Python con Pillow para comparar píxeles y armar las imágenes lado a lado.
  const script = `
import os, sys, json
from PIL import Image, ImageChops
a, d, s = sys.argv[1:4]
out = []
for f in sorted(os.listdir(d)):
    if not os.path.exists(os.path.join(a, f)):
        out.append({"f": f, "estado": "nueva"}); continue
    ia = Image.open(os.path.join(a, f)).convert("RGB"); id_ = Image.open(os.path.join(d, f)).convert("RGB")
    if ia.size == id_.size:
        dif = ImageChops.difference(ia, id_).convert("L").point(lambda v: 255 if v > 40 else 0)
        caja = dif.getbbox()
        pct = round(100 * dif.histogram()[255] / (ia.width * ia.height), 2)
    else:
        caja, pct = "tamaño", None
    h = max(ia.height, id_.height); w = ia.width
    lado = Image.new("RGB", (w * 2 + 20, h), "white"); lado.paste(ia, (0, 0)); lado.paste(id_, (w + 20, 0))
    lado.save(os.path.join(s, "lado-" + f))
    out.append({"f": f, "estado": "igual" if caja is None else "distinta", "alto": [ia.height, id_.height], "pct": pct})
print(json.dumps(out))
`;
  // El script va a un archivo (no entre comillas) para que funcione igual en Linux y en Windows.
  const archivo = path.join(os.tmpdir(), `verificar-comparar-${process.pid}.py`);
  fs.writeFileSync(archivo, script);
  try {
    for (const python of ['python3', 'python']) {
      try { return JSON.parse(execSync(`${python} "${archivo}" "${antes}" "${despues}" "${salida}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { /* probar el siguiente */ }
    }
    return null; // sin Pillow: quedan las capturas sueltas
  } finally {
    fs.rmSync(archivo, { force: true });
  }
}

// ---------- producción ----------
function pedirCabeceras(url) {
  return new Promise((resolver, rechazar) => {
    https.get(url, (r) => { r.resume(); resolver({ estado: r.statusCode, cabeceras: r.headers }); }).on('error', rechazar);
  });
}

async function verificarProduccion(navegador) {
  const esperadas = leerCabeceras(RAIZ);
  try {
    const { estado, cabeceras } = await pedirCabeceras(`${URL_PRODUCCION}/`);
    anotar('Producción', `${URL_PRODUCCION}/ responde`, estado === 200, `Código ${estado}`);
    const faltan = Object.entries(esperadas)
      .filter(([k, v]) => (cabeceras[k.toLowerCase()] || '').trim() !== v)
      .map(([k]) => k);
    anotar('Producción', 'cabeceras iguales a _headers', faltan.length === 0, faltan.length ? `Distintas o ausentes: ${faltan.join(', ')} (¿falta aceptar el PR o terminar el deploy?)` : '');
  } catch (e) {
    anotar('Producción', `${URL_PRODUCCION} accesible`, false, `No se pudo conectar: ${e.message}. Puede que la red del entorno no permita ese dominio.`);
    return;
  }
  for (const archivo of PAGINAS) {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    // Cloudflare Pages sirve cada página sin «.html» (pedir /privacidad.html redirige a /privacidad).
    const { csp, errores } = await abrir(contexto, `${URL_PRODUCCION}/${archivo === 'index.html' ? '' : archivo.replace(/\.html$/, '')}`, { bloquearHud: true });
    anotar('Producción', `${archivo}: sin bloqueos de CSP`, csp.length === 0, csp.join('\n'));
    anotar('Producción', `${archivo}: sin errores de JavaScript`, errores.length === 0, errores.join('\n'));
    await contexto.close();
  }
}

// ---------- principal ----------
(async () => {
  const navegador = await chromium.launch(canal ? { channel: canal } : {});
  const { servidor, base } = await servir(RAIZ);
  let comparacion = null;
  try {
    await verificarLocal(navegador, base);

    if (COMPARAR) {
      const rama = typeof COMPARAR === 'string' ? COMPARAR : 'origin/main';
      const dirAntes = fs.mkdtempSync(path.join(os.tmpdir(), 'verificar-antes-'));
      execSync(`git -C "${RAIZ}" worktree add --detach "${dirAntes}" ${rama}`, { stdio: 'ignore' });
      try {
        const antes = await servir(dirAntes);
        await capturar(navegador, antes.base, path.join(SALIDA, 'antes'), dirAntes);
        antes.servidor.close();
      } finally {
        execSync(`git -C "${RAIZ}" worktree remove --force "${dirAntes}"`, { stdio: 'ignore' });
      }
      await capturar(navegador, base, path.join(SALIDA, 'despues'));
      comparacion = { rama, filas: compararCapturas(path.join(SALIDA, 'antes'), path.join(SALIDA, 'despues'), SALIDA) };
    }

    if (PRODUCCION) await verificarProduccion(navegador);
  } finally {
    servidor.close();
    await navegador.close();
  }

  // ---------- informe ----------
  const fallas = resultados.filter((r) => !r.ok);
  const lineas = [`# Verificación del sitio`, '', fallas.length === 0 ? `**Todo OK:** ${resultados.length} verificaciones pasaron.` : `**${fallas.length} de ${resultados.length} verificaciones fallaron.**`, ''];
  const grupos = [...new Set(resultados.map((r) => r.grupo))];
  for (const grupo of grupos) {
    lineas.push(`## ${grupo}`);
    for (const r of resultados.filter((x) => x.grupo === grupo)) {
      lineas.push(`- ${r.ok ? '✅' : '❌'} ${r.nombre}${r.detalle && (!r.ok || grupo === 'Menú para celular') ? ` — ${r.detalle.split('\n').join('; ')}` : ''}`);
    }
  }
  if (comparacion) {
    lineas.push('', `## Capturas contra ${comparacion.rama}`, `Carpeta: ${SALIDA}`);
    if (comparacion.filas) for (const c of comparacion.filas) {
      const detalle = c.alto && c.alto[0] !== c.alto[1] ? ` (alto ${c.alto[0]} → ${c.alto[1]} px)` : (c.estado === 'distinta' && c.pct !== null ? ` (${c.pct} % de los píxeles)` : '');
      lineas.push(`- ${c.f}: ${c.estado}${detalle}`);
    }
    else lineas.push('- No se pudieron comparar (falta Python con Pillow); las capturas quedaron en las carpetas antes/ y despues/.');
    lineas.push('Las imágenes lado-*.png muestran antes (izquierda) y después (derecha).');
  }
  const informe = lineas.join('\n');
  fs.writeFileSync(path.join(SALIDA, 'informe.md'), informe + '\n');
  console.log(informe);
  console.log(`\nInforme guardado en ${path.join(SALIDA, 'informe.md')}`);
  process.exit(fallas.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
