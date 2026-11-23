// Comportamiento de la página de inicio: menú para celular y botón para copiar el email.

// Menú para celular
const menuBoton = document.querySelector('.menu-boton');
const menu = document.getElementById('menu');
const abrirMenu = (abrir) => {
  menuBoton.setAttribute('aria-expanded', String(abrir));
  menu.classList.toggle('abierto', abrir);
};
menuBoton.addEventListener('click', () => abrirMenu(menuBoton.getAttribute('aria-expanded') !== 'true'));
// Cualquier enlace del encabezado (secciones, logo o Escribime) cierra el menú
document.querySelector('.encabezado').addEventListener('click', (e) => { if (e.target.closest('a')) abrirMenu(false); });
// Si el foco del teclado sale del encabezado, se cierra
document.querySelector('.encabezado').addEventListener('focusout', (e) => {
  if (e.relatedTarget && !e.relatedTarget.closest('.encabezado')) abrirMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menu.classList.contains('abierto')) { abrirMenu(false); menuBoton.focus(); }
});
document.addEventListener('click', (e) => {
  if (menu.classList.contains('abierto') && !e.target.closest('.encabezado')) abrirMenu(false);
});
const escritorio = matchMedia('(min-width: 761px)');
const alPasarAEscritorio = (e) => { if (e.matches) abrirMenu(false); };
if (escritorio.addEventListener) escritorio.addEventListener('change', alPasarAEscritorio);
else escritorio.addListener(alPasarAEscritorio); // Safari anterior a 14

const EMAIL = 'contacto@ualvarez.com.ar';
const aviso = document.getElementById('aviso');
let temporizador;
document.getElementById('copiar').addEventListener('click', async () => {
  clearTimeout(temporizador);
  try {
    await navigator.clipboard.writeText(EMAIL);
    aviso.textContent = 'Email copiado.';
  } catch {
    aviso.textContent = 'No se pudo copiar. El email es ' + EMAIL;
  }
  temporizador = setTimeout(() => { aviso.textContent = ''; }, 4000);
});
