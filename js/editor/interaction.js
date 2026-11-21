/**
 * Interacción del editor: mouse, toque y teclado → operaciones sobre el Circuit.
 *
 * Flujo: el usuario hace algo → EditorController llama a un método del Circuit →
 * el Circuit avisa que cambió (onChange) → el controlador redibuja el lienzo.
 * El controlador nunca modifica el dibujo directamente.
 *
 * Se usan Pointer Events (pointerdown/move/up) en vez de mouse events porque
 * funcionan igual con mouse, pantalla táctil y lápiz.
 *
 * Atajos: R = rotar · Supr/Retroceso = eliminar · Esc = quitar selección
 */
import { GRID_SIZE, HALF_LENGTH } from './geometry.js';

/** Ajusta un valor a la línea de cuadrícula más cercana. */
const snap = (value) => Math.round(value / GRID_SIZE) * GRID_SIZE;

/** Distancia mínima al borde, para que ningún componente quede fuera del lienzo. */
const EDGE_MARGIN = HALF_LENGTH;

export class EditorController {
  /**
   * @param {object} deps
   * @param {import('../model/circuit.js').Circuit} deps.circuit
   * @param {import('./canvas.js').CircuitCanvas} deps.canvas
   * @param {HTMLElement} deps.toolbar contenedor con botones [data-type]
   * @param {(component: object|null) => void} [deps.onSelectionChange]
   */
  constructor({ circuit, canvas, toolbar, onSelectionChange = () => {} }) {
    this.circuit = circuit;
    this.canvas = canvas;
    this.toolbar = toolbar;
    this.onSelectionChange = onSelectionChange;

    this.selectedId = null;
    /** Arrastre en curso: null | {mode:'move', ...} | {mode:'place', ...} */
    this.drag = null;

    this.bindCanvasEvents();
    this.bindToolbarEvents();
    this.bindKeyboard();
    circuit.onChange(() => this.render());
    this.render();
  }

  // ---------- Acciones públicas (también las usan los botones Rotar/Eliminar) ----------

  rotateSelected() {
    if (this.selectedId) this.circuit.rotateComponent(this.selectedId);
  }

  deleteSelected() {
    if (!this.selectedId) return;
    const id = this.selectedId;
    this.select(null);
    this.circuit.removeComponent(id);
  }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.render();
    this.onSelectionChange(id ? this.circuit.getComponent(id) : null);
  }

  render() {
    this.canvas.render(this.circuit.toModel(), { selectedId: this.selectedId });
  }

  // ---------- Mover componentes que ya están en el lienzo ----------

  bindCanvasEvents() {
    const svg = this.canvas.svg;

    svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return; // solo botón principal
      const group = event.target.closest('.layer-components .component');
      if (!group) {
        this.select(null); // clic en zona vacía
        return;
      }

      const component = this.circuit.getComponent(group.dataset.id);
      this.select(component.id);

      // Se guarda la distancia entre el puntero y el centro del componente para
      // que no "salte" al centro del cursor cuando empiece a moverse.
      const point = this.canvas.toSvgPoint(event.clientX, event.clientY);
      this.drag = { mode: 'move', id: component.id, dx: point.x - component.x, dy: point.y - component.y };

      // Captura: los siguientes eventos llegan al SVG aunque el puntero salga de él.
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    svg.addEventListener('pointermove', (event) => {
      if (this.drag?.mode !== 'move') return;
      const point = this.canvas.toSvgPoint(event.clientX, event.clientY);
      const { x, y } = this.clampToCanvas({ x: snap(point.x - this.drag.dx), y: snap(point.y - this.drag.dy) });
      this.circuit.moveComponent(this.drag.id, x, y);
    });

    const endMove = (event) => {
      if (this.drag?.mode !== 'move') return;
      this.drag = null;
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    };
    svg.addEventListener('pointerup', endMove);
    svg.addEventListener('pointercancel', endMove);
  }

  // ---------- Agregar componentes desde la barra ----------

  bindToolbarEvents() {
    for (const button of this.toolbar.querySelectorAll('[data-type]')) {
      const type = button.dataset.type;

      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        this.drag = { mode: 'place', type, target: null, moved: false };
        button.setPointerCapture(event.pointerId);
        event.preventDefault();
      });

      button.addEventListener('pointermove', (event) => {
        if (this.drag?.mode !== 'place') return;
        this.drag.moved = true;
        const point = this.canvas.toSvgPoint(event.clientX, event.clientY);
        if (this.canvas.contains(point)) {
          this.drag.target = this.clampToCanvas({ x: snap(point.x), y: snap(point.y) });
          this.canvas.showGhost({ id: '', type, rotation: 0, ...this.drag.target });
        } else {
          this.drag.target = null;
          this.canvas.hideGhost();
        }
      });

      button.addEventListener('pointerup', () => {
        if (this.drag?.mode !== 'place') return;
        const { target, moved } = this.drag;
        this.drag = null;
        this.canvas.hideGhost();

        if (target) this.place(type, target);              // soltado sobre el lienzo
        else if (!moved) this.place(type, this.freeSpot()); // clic simple
        // soltado fuera del lienzo: se cancela
      });

      button.addEventListener('pointercancel', () => {
        this.drag = null;
        this.canvas.hideGhost();
      });

      // Accesibilidad: con teclado (Tab + Enter) no hay eventos de puntero, solo "click".
      // event.detail === 0 significa que el click no vino del mouse.
      button.addEventListener('click', (event) => {
        if (event.detail === 0) this.place(type, this.freeSpot());
      });
    }
  }

  place(type, { x, y }) {
    const component = this.circuit.addComponent(type, x, y);
    this.select(component.id);
  }

  /** Centro del lienzo; si está ocupado, avanza en diagonal hasta encontrar un lugar libre. */
  freeSpot() {
    const { width, height } = this.canvas.svg.viewBox.baseVal;
    let spot = { x: snap(width / 2), y: snap(height / 2) };
    const occupied = ({ x, y }) => this.circuit.components.some((c) => c.x === x && c.y === y);
    for (let i = 0; i < 20 && occupied(spot); i++) {
      spot = this.clampToCanvas({ x: spot.x + 2 * GRID_SIZE, y: spot.y + 2 * GRID_SIZE });
    }
    return spot;
  }

  clampToCanvas({ x, y }) {
    const { width, height } = this.canvas.svg.viewBox.baseVal;
    return {
      x: Math.min(Math.max(x, EDGE_MARGIN), width - EDGE_MARGIN),
      y: Math.min(Math.max(y, EDGE_MARGIN), height - EDGE_MARGIN),
    };
  }

  // ---------- Teclado ----------

  bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      // No interferir cuando el usuario escribe en un campo de texto.
      if (event.target.closest('input, textarea, select, [contenteditable]')) return;
      if (!this.selectedId) return;

      switch (event.key) {
        case 'r':
        case 'R':
          this.rotateSelected();
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault(); // Retroceso no debe navegar hacia atrás
          this.deleteSelected();
          break;
        case 'Escape':
          this.select(null);
          break;
        default:
      }
    });
  }
}
