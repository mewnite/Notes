// Archivo refactorizado: index.js
// Propósito: lógica del 'decisiometro' — crear entradas, mezclar decisiones, mostrar resultado
// Comentarios y nombres en español para que el código sea más natural y fácil de mantener.

// Helper pequeño para obtener elementos por id con guardias
const $id = (id) => document.getElementById(id);

// Valores y referencias iniciales (se obtendrán al cargar el DOM)
let manoDer;
let manoIzq;
let botonDecisio;

// Estado local para saber si estamos en modo 'rosa'
const COQUETE_KEY = 'coquete';

// Inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  // Garantizar valor por defecto en localStorage
  if (localStorage.getItem(COQUETE_KEY) === null) {
    localStorage.setItem(COQUETE_KEY, 'false');
  }

  manoDer = $id('mano_der');
  manoIzq = $id('mano_izq');

  // Si no existe el botón, lo creamos (igual comportamiento que antes)
  botonDecisio = $id('boton');
  const contenedor = $id('Contenedor');
  if (!botonDecisio && contenedor) {
    botonDecisio = document.createElement('button');
    botonDecisio.id = 'boton';
    botonDecisio.textContent = 'Decisiometro';
    contenedor.appendChild(botonDecisio);
  }

  // Preparar el contador visual y listeners
  asegurarseContador();
  const rangoEl = $id('rango');
  if (rangoEl) rangoEl.addEventListener('input', onRangoInput);

  // Listener único para generar inputs según el rango
  if (botonDecisio && !botonDecisio._hasClickListener) {
    botonDecisio.addEventListener('click', onBotonDecisioClick);
    botonDecisio._hasClickListener = true;
  }

  const publicar = $id('publicar');
  if (publicar) publicar.addEventListener('click', onPublicarClick);

  const coquete = $id('coquete');
  if (coquete) coquete.addEventListener('click', onToggleCoquete);

  const enviarPregunta = $id('enviar_pregunta');
  if (enviarPregunta) enviarPregunta.addEventListener('click', onEnviarPregunta);

  const tituloInput = $id('titulo');
  if (tituloInput) {
    tituloInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') onEnviarPregunta();
    });
  }
});

// --- Utilidades visuales ---
function mostrarCargando() {
  const spinner = $id('loading-spinner');
  if (spinner) spinner.classList.add('loading');
}

function ocultarCargando() {
  const spinner = $id('loading-spinner');
  if (spinner) spinner.classList.remove('loading');
}

function animarManosEntrada() {
  if (!manoDer || !manoIzq) return;
  manoDer.style.display = 'block';
  manoIzq.style.display = 'block';
  if (typeof manoDer.animate === 'function') {
    manoDer.animate([
      { right: '0' },
      { right: '25%' }
    ], { duration: 3000, easing: 'ease', fill: 'forwards' });
  }
  if (typeof manoIzq.animate === 'function') {
    manoIzq.animate([
      { left: '0' },
      { left: '25%' }
    ], { duration: 4000, easing: 'ease', fill: 'forwards' });
  }
}

// Animación inversa al finalizar
function animarManosSalida() {
  if (typeof manoDer?.animate === 'function') {
    manoDer.animate([
      { right: '25%' },
      { right: '0%' }
    ], { duration: 3000, easing: 'ease', fill: 'forwards' });
  }
  if (typeof manoIzq?.animate === 'function') {
    manoIzq.animate([
      { left: '25%' },
      { left: '0%' }
    ], { duration: 3000, easing: 'ease', fill: 'forwards' });
  }
}

// --- Contador de inputs ---
function asegurarseContador() {
  const cont = $id('Contenedor');
  if (!cont) return;
  let contador = $id('contador');
  if (!contador) {
    contador = document.createElement('span');
    contador.id = 'contador';
    contador.className = 'contador';
    cont.appendChild(contador);
  }
  actualizarContador();
}

function actualizarContador() {
  const inputs = document.querySelectorAll('input[id^="input"]');
  const rango = $id('rango');
  const max = rango ? rango.value : 0;
  const contador = $id('contador');
  if (contador) contador.innerText = `${inputs.length} / ${max}`;
}

// --- Handlers de eventos ---
function onRangoInput() {
  const rango = $id('rango');
  const valorEl = $id('valor');
  if (rango && valorEl) valorEl.innerText = rango.value;

  // Si existe un elemento con id 'coquete' que por alguna razón debe eliminarse, lo quitamos
  const coquete = $id('coquete');
  if (coquete?.parentNode) coquete.parentNode.removeChild(coquete);
  actualizarContador();
}

function onBotonDecisioClick() {
  const rango = $id('rango');
  const publicarEl = $id('publicar');
  const cantidad = parseInt(rango?.value || '1', 10) || 1;
  if (publicarEl) publicarEl.style.display = 'block';

  const existentes = document.querySelectorAll('input[id^="input"]');
  const diferencia = cantidad - existentes.length;

  if (diferencia > 0 && !$id('oraculo')) {
    // Añadir inputs hasta coincidir con el rango
    for (let i = 0; i < diferencia; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `input${existentes.length + i}`;
      input.classList.add('styled-input');
      input.required = true;

      const estado = localStorage.getItem(COQUETE_KEY);
      if (estado === 'true') input.classList.add('rosa');

      input.placeholder = `Ingrese la decisión número: ${existentes.length + i + 1}`;
      const contenedorEl = $id('Contenedor') || document.body;
      contenedorEl.appendChild(input);
      actualizarContador();
    }
  } else if (diferencia < 0) {
    // Eliminar inputs sobrantes del final
    for (let i = 0; i < Math.abs(diferencia); i++) {
      const el = document.querySelectorAll('input[id^="input"]');
      const toRemove = el[el.length - 1 - i];
      if (toRemove?.parentNode) toRemove.parentNode.removeChild(toRemove);
      actualizarContador();
    }
  }
}

function mezclarArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function onPublicarClick() {
  const inputs = document.querySelectorAll('input[id^="input"]');
  const decisiones = [];
  inputs.forEach((input) => {
    decisiones.push(input.value);
    input.value = '';
  });

  if (decisiones.length === 0) return; // nada que publicar

  const mezcladas = mezclarArray(decisiones.slice());
  const indice = Math.floor(Math.random() * mezcladas.length);
  const resultadoFinal = mezcladas[indice];

  let respuesta = $id('respuesta');
  if (!respuesta) {
    const contenedorEl = $id('Contenedor') || document.body;
    respuesta = contenedorEl.appendChild(document.createElement('div'));
    respuesta.id = 'respuesta';
    respuesta.className = 'respuesta';

    const spinner = respuesta.appendChild(document.createElement('div'));
    spinner.id = 'loading-spinner';
    spinner.className = 'spinner';

    const oraculo = respuesta.appendChild(document.createElement('p'));
    oraculo.id = 'oraculo';
    oraculo.className = 'oraculo';
    oraculo.style.zIndex = '0';
    oraculo.innerText = resultadoFinal;

    // Elegir animación según ancho de pantalla
    const ancho = window.innerWidth;
    if (ancho > 750) {
      animarManosEntrada();
    } else {
      mostrarCargando();
    }

    // Mostrar resultado tras una espera y añadir botón de reinicio
    setTimeout(() => {
      oraculo.style.display = 'block';
      const reinicio = $id('Contenedor').appendChild(document.createElement('button'));
      reinicio.id = 'reiniciar';
      reinicio.className = 'reiniciar';
      reinicio.textContent = 'Reiniciar';
      reinicio.addEventListener('click', () => location.reload());

      ocultarCargando();
      animarManosSalida();
    }, 4000);

    // Actualizar contador (los inputs quedaron vacíos)
    actualizarContador();

    // Limpiar manos del DOM si existen tras la animación
    setTimeout(() => {
      if (manoDer?.parentNode) manoDer.parentNode.removeChild(manoDer);
      if (manoIzq?.parentNode) manoIzq.parentNode.removeChild(manoIzq);
    }, 8000);
  }
}

// --- Toggle 'coquete' (tema rosa) ---
let primerClickCoquete = true;
function onToggleCoquete() {
  const titulo = $id('titulo');
  const nuevoTitulo = $id('nuevo_titulo');
  const publicar = $id('publicar');

  if (primerClickCoquete) {
    if (titulo) titulo.classList.add('rosa');
    if (nuevoTitulo) nuevoTitulo.classList.add('rosa');
    localStorage.setItem(COQUETE_KEY, 'true');
    document.body.classList.add('rosa');
    $id('Contenedor')?.classList.add('rosa');
    $id('rango')?.classList.add('rosa');
    $id('boton')?.classList.add('rosa');
    $id('normal')?.classList.add('rosa');
    if (publicar && localStorage.getItem(COQUETE_KEY) === 'true') publicar.classList.add('rosa');
    primerClickCoquete = false;
  } else {
    localStorage.setItem(COQUETE_KEY, 'false');
    document.body.classList.remove('rosa');
    $id('enviar_pregunta')?.classList.remove('rosa');
    $id('nuevo_titulo')?.classList.remove('rosa');
    $id('Contenedor')?.classList.remove('rosa');
    $id('rango')?.classList.remove('rosa');
    $id('boton')?.classList.remove('rosa');
    if (titulo) titulo.classList.remove('rosa');
    if (publicar) publicar.classList.remove('rosa');
    primerClickCoquete = true;
  }
}

// --- Replace input title by H2 (enviar pregunta) ---
function onEnviarPregunta() {
  const titulo = $id('titulo');
  if (!titulo) return;
  const texto = titulo.value?.trim();
  if (!texto) return;

  const cont = $id('cont');
  const label = $id('label');
  if (!cont) return;

  if (titulo.parentNode === cont) {
    cont.removeChild(titulo);
    if (label && label.parentNode === cont) cont.removeChild(label);
  }

  const h2 = cont.appendChild(document.createElement('h2'));
  h2.textContent = texto;
  h2.className = 'nuevo_titulo';
  h2.id = 'nuevo_titulo';

  const enviarBtn = $id('enviar_pregunta');
  if (enviarBtn && enviarBtn.parentNode === $id('cont')) {
    cont.removeChild(enviarBtn);
  }
}

