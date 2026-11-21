/**
 * Punto de entrada: conecta las capas.
 *
 *   CircuitModel ──withTerminals──► dibujo (canvas.js)
 *        │
 *        └──buildNetlist──► Netlist ──solveDC──► Resultados ──► tabla (results.js)
 *
 * Este archivo solo coordina; no contiene lógica de dibujo ni de cálculo.
 */
import { withTerminals } from './editor/geometry.js';
import { CircuitCanvas } from './editor/canvas.js';
import { buildNetlist } from './model/netlist.js';
import { solveDC } from './solver/dc.js';
import { renderDCResults, renderError } from './ui/results.js';

const EXAMPLE_URL = 'examples/divisor-voltaje.json';

const dom = {
  svg: document.getElementById('circuit-canvas'),
  results: document.getElementById('results'),
  circuitName: document.getElementById('circuit-name'),
  simulateButton: document.getElementById('btn-simulate-dc'),
};

const canvas = new CircuitCanvas(dom.svg);
let model = null;

async function loadExample(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${response.status})`);
  const json = await response.json();
  dom.circuitName.textContent = json.name ?? 'Circuito';
  return withTerminals(json);
}

function simulateDC() {
  try {
    const netlist = buildNetlist(model);
    const result = solveDC(netlist);
    renderDCResults(dom.results, netlist, result);
  } catch (error) {
    console.error(error);
    renderError(dom.results, error);
  }
}

async function init() {
  try {
    model = await loadExample(EXAMPLE_URL);
    canvas.render(model);
    dom.simulateButton.disabled = false;
    dom.simulateButton.addEventListener('click', simulateDC);
  } catch (error) {
    console.error(error);
    renderError(dom.results, error);
  }
}

init();
