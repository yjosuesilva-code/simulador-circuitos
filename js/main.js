/**
 * Punto de entrada: conecta las capas.
 *
 *   Circuit (modelo) ◄──── EditorController ◄──── mouse / teclado
 *        │  onChange           │
 *        │                     └──► CircuitCanvas (dibujo)
 *        └──toModel──► buildNetlist ──► solveDC ──► tabla de resultados
 *
 * Este archivo solo coordina; no contiene lógica de dibujo ni de cálculo.
 */
import { Circuit } from './model/circuit.js';
import { CircuitCanvas } from './editor/canvas.js';
import { EditorController } from './editor/interaction.js';
import { buildNetlist } from './model/netlist.js';
import { solveDC } from './solver/dc.js';
import { renderDCResults, renderError } from './ui/results.js';

const EXAMPLE_URL = 'examples/divisor-voltaje.json';

const dom = {
  svg: document.getElementById('circuit-canvas'),
  toolbar: document.getElementById('toolbar'),
  results: document.getElementById('results'),
  circuitName: document.getElementById('circuit-name'),
  simulateButton: document.getElementById('btn-simulate-dc'),
  rotateButton: document.getElementById('btn-rotate'),
  deleteButton: document.getElementById('btn-delete'),
};

const RESULTS_HINT = '<p class="text-body-secondary mb-0">Pulsa <strong>Simular DC</strong> para ver los resultados.</p>';

async function loadExample(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${response.status})`);
  return response.json();
}

function simulateDC(circuit) {
  try {
    const netlist = buildNetlist(circuit.toModel());
    const result = solveDC(netlist);
    renderDCResults(dom.results, netlist, result);
  } catch (error) {
    console.error(error);
    renderError(dom.results, error);
  }
}

/** Eliminar: con cualquier selección. Rotar: solo componentes (la tierra no rota). */
function updateSelectionButtons(selection) {
  dom.deleteButton.disabled = !selection;
  dom.rotateButton.disabled = selection?.kind !== 'component' || selection.item.type === 'GND';
}

async function init() {
  try {
    const json = await loadExample(EXAMPLE_URL);
    dom.circuitName.textContent = json.name ?? 'Circuito';

    const circuit = new Circuit(json);
    const canvas = new CircuitCanvas(dom.svg);
    const editor = new EditorController({
      circuit, canvas, toolbar: dom.toolbar, onSelectionChange: updateSelectionButtons,
    });

    // Si el circuito cambia, los resultados mostrados ya no corresponden.
    circuit.onChange(() => { dom.results.innerHTML = RESULTS_HINT; });

    dom.simulateButton.addEventListener('click', () => simulateDC(circuit));
    dom.rotateButton.addEventListener('click', () => editor.rotateSelected());
    dom.deleteButton.addEventListener('click', () => editor.deleteSelected());
    dom.simulateButton.disabled = false;
  } catch (error) {
    console.error(error);
    renderError(dom.results, error);
  }
}

init();
