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
 * Qué hace un clic según dónde cae (en este orden de prioridad):
 *   terminal / punto de conexión → trazar un cable (arrastrando hasta el destino)
 *   componente                   → seleccionar y mover
 *   cable                        → seleccionar
 *   zona vacía                   → quitar la selección
 *
 * Atajos: R = rotar · Supr/Retroceso = eliminar · Esc = quitar selección o cancelar cable
 *         Ctrl+Z = deshacer · Ctrl+Y o Ctrl+Shift+Z = rehacer
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
   * @param {(selection: {kind: 'component'|'wire', item: object}|null) => void} [deps.onSelectionChange]
   */
  constructor({ circuit, canvas, toolbar, onSelectionChange = () => {} }) {
    this.circuit = circuit;
    this.canvas = canvas;
    this.toolbar = toolbar;
    this.onSelectionChange = onSelectionChange;

    /** id del componente o cable seleccionado (los id no se repiten entre ambos: R1, W1…) */
    this.selectedId = null;
    /** Arrastre en curso: null | {mode:'move'} | {mode:'place'} | {mode:'wire'} */
    this.drag = null;

    this.bindCanvasEvents();
    this.bindToolbarEvents();
    this.bindKeyboard();
    circuit.onChange(() => this.handleCircuitChange());
    this.render();
  }

  /**
   * Tras cualquier cambio: redibujar y refrescar la selección. Después de deshacer,
   * lo seleccionado puede haber dejado de existir (p. ej. se deshizo su creación).
   */
  handleCircuitChange() {
    if (this.selectedId && !this.getSelection()) this.selectedId = null;
    this.render();
    this.onSelectionChange(this.getSelection());
  }

  undo() {
    this.cancelDrag();
    this.circuit.undo();
  }

  redo() {
    this.cancelDrag();
    this.circuit.redo();
  }

  // ---------- Acciones públicas (también las usan los botones Rotar/Eliminar) ----------

  rotateSelected() {
    if (this.selectedId) this.circuit.rotateComponent(this.selectedId);
  }

  deleteSelected() {
    const selection = this.getSelection();
    if (!selection) return;
    this.select(null);
    if (selection.kind === 'wire') this.circuit.removeWire(selection.item.id);
    else this.circuit.removeComponent(selection.item.id);
  }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.render();
    this.onSelectionChange(this.getSelection());
  }

  /** @returns {{kind: 'component'|'wire', item: object}|null} */
  getSelection() {
    if (!this.selectedId) return null;
    const component = this.circuit.getComponent(this.selectedId);
    if (component) return { kind: 'component', item: component };
    const wire = this.circuit.getWire(this.selectedId);
    return wire ? { kind: 'wire', item: wire } : null;
  }

  render() {
    // Mientras se arrastra, si el componente queda encima de otro se marca en rojo:
    // al soltarlo ahí volverá a su posición original.
    let invalidId = null;
    if (this.drag?.mode === 'move') {
      const component = this.circuit.getComponent(this.drag.id);
      if (component && this.circuit.overlaps(component)) invalidId = component.id;
    }
    this.canvas.render(this.circuit.toModel(), { selectedId: this.selectedId, invalidId });
  }

  // ---------- Eventos del lienzo: mover componentes y trazar cables ----------

  bindCanvasEvents() {
    const svg = this.canvas.svg;

    svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return; // solo botón principal

      const terminal = event.target.closest('.terminal');
      const componentEl = event.target.closest('.layer-components .component');
      const wireEl = event.target.closest('.wire-group');

      if (terminal) {
        this.startWire({ x: Number(terminal.dataset.x), y: Number(terminal.dataset.y) });
      } else if (componentEl) {
        this.startMove(componentEl.dataset.id, event);
      } else if (wireEl) {
        this.select(wireEl.dataset.id);
        return; // los cables se seleccionan pero no se arrastran (paso 3)
      } else {
        this.select(null); // clic en zona vacía
        return;
      }

      // Captura: los siguientes eventos llegan al SVG aunque el puntero salga de él.
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    svg.addEventListener('pointermove', (event) => {
      const point = this.canvas.toSvgPoint(event.clientX, event.clientY);
      if (this.drag?.mode === 'move') this.continueMove(point);
      else if (this.drag?.mode === 'wire') this.continueWire(point);
    });

    svg.addEventListener('pointerup', (event) => {
      if (this.drag?.mode === 'wire') this.finishWire();
      if (this.drag?.mode === 'move') this.finishMove();
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    });

    svg.addEventListener('pointercancel', () => this.cancelDrag());
  }

  /** Cancela cualquier arrastre en curso. Si se estaba moviendo un componente, vuelve a su lugar. */
  cancelDrag() {
    const wasMoving = this.drag?.mode === 'move';
    this.drag = null;
    this.canvas.hideGhost();
    if (wasMoving && this.circuit.dragState) {
      // Se fuerza la posición original y se termina: endDrag la detecta como "sin cambios".
      const original = this.circuit.dragState.base.components.find((c) => c.id === this.circuit.dragState.id);
      this.circuit.dragTo(original.x, original.y);
      this.circuit.endDrag();
    }
  }

  // --- Mover ---

  startMove(id, event) {
    const component = this.circuit.getComponent(id);
    this.select(id);
    // Se guarda la distancia entre el puntero y el centro del componente para
    // que no "salte" al centro del cursor cuando empiece a moverse.
    const point = this.canvas.toSvgPoint(event.clientX, event.clientY);
    this.drag = { mode: 'move', id, dx: point.x - component.x, dy: point.y - component.y };
    this.circuit.startDrag(id);
  }

  continueMove(point) {
    const { x, y } = this.clampToCanvas({ x: snap(point.x - this.drag.dx), y: snap(point.y - this.drag.dy) });
    this.circuit.dragTo(x, y);
  }

  finishMove() {
    this.drag = null;
    this.circuit.endDrag(); // si quedó encimado, el modelo lo devuelve a su lugar
  }

  // --- Trazar cables ---

  startWire(start) {
    this.select(null);
    // verticalFirst: orientación del primer tramo de la L. Se decide con el primer
    // movimiento claro del usuario (como en KiCad): si arranca hacia abajo, el
    // cable baja primero; si arranca hacia un lado, avanza primero en horizontal.
    this.drag = { mode: 'wire', start, end: start, verticalFirst: null };
  }

  continueWire(point) {
    const { start } = this.drag;
    const end = this.clampToCanvas({ x: snap(point.x), y: snap(point.y) }, 0);
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    if (dx === 0 && dy === 0) this.drag.verticalFirst = null;      // volvió al inicio: se decide de nuevo
    else if (this.drag.verticalFirst === null) this.drag.verticalFirst = dy > dx;

    this.drag.end = end;
    this.canvas.showWirePreview(this.wirePath());
  }

  finishWire() {
    const points = this.wirePath();
    this.cancelDrag();
    this.circuit.addWirePath(points); // si inicio = fin no crea nada
  }

  /** Puntos del cable en L: [inicio, codo, fin]. Si están alineados, el codo coincide y se descarta. */
  wirePath() {
    const { start, end, verticalFirst } = this.drag;
    const elbow = verticalFirst ? { x: start.x, y: end.y } : { x: end.x, y: start.y };
    return [start, elbow, end];
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
          // La vista previa se muestra donde realmente quedará: el lugar libre más cercano.
          this.drag.target = this.nearestFreeSpot(type, { x: snap(point.x), y: snap(point.y) });
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

        if (target) this.place(type, target);                   // soltado sobre el lienzo
        else if (!moved) this.place(type, this.freeSpot(type)); // clic simple
        // soltado fuera del lienzo: se cancela
      });

      button.addEventListener('pointercancel', () => {
        this.drag = null;
        this.canvas.hideGhost();
      });

      // Accesibilidad: con teclado (Tab + Enter) no hay eventos de puntero, solo "click".
      // event.detail === 0 significa que el click no vino del mouse.
      button.addEventListener('click', (event) => {
        if (event.detail === 0) this.place(type, this.freeSpot(type));
      });
    }
  }

  place(type, { x, y }) {
    const component = this.circuit.addComponent(type, x, y);
    this.select(component.id);
  }

  /** Lugar libre más cercano al centro del lienzo (para el clic simple en la barra). */
  freeSpot(type) {
    const { width, height } = this.canvas.svg.viewBox.baseVal;
    return this.nearestFreeSpot(type, { x: snap(width / 2), y: snap(height / 2) });
  }

  /**
   * Busca en "anillos" cada vez más grandes alrededor del punto deseado el primer lugar
   * de la cuadrícula donde el componente no se encime con otro. Dentro de cada anillo
   * se prueban primero los puntos más cercanos.
   */
  nearestFreeSpot(type, desired) {
    const MAX_RINGS = 15;
    for (let ring = 0; ring <= MAX_RINGS; ring++) {
      const candidates = [];
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // solo el borde del anillo
          candidates.push(this.clampToCanvas({ x: desired.x + dx * GRID_SIZE, y: desired.y + dy * GRID_SIZE }));
        }
      }
      candidates.sort((a, b) =>
        Math.hypot(a.x - desired.x, a.y - desired.y) - Math.hypot(b.x - desired.x, b.y - desired.y));
      const free = candidates.find((p) => this.circuit.isFree(type, p.x, p.y));
      if (free) return free;
    }
    return desired; // lienzo lleno: se acepta encimado antes que perder el componente
  }

  /** Limita un punto al área del lienzo, dejando `margin` px libres en el borde. */
  clampToCanvas({ x, y }, margin = EDGE_MARGIN) {
    const { width, height } = this.canvas.svg.viewBox.baseVal;
    return {
      x: Math.min(Math.max(x, margin), width - margin),
      y: Math.min(Math.max(y, margin), height - margin),
    };
  }

  // ---------- Teclado ----------

  bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      // No interferir cuando el usuario escribe en un campo de texto.
      if (event.target.closest('input, textarea, select, [contenteditable]')) return;
      // Deshacer / rehacer (Cmd en Mac, Ctrl en Windows/Linux)
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); this.undo(); }
        else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); this.redo(); }
        return;
      }
      if (event.key === 'Escape' && this.drag) {
        this.cancelDrag(); // cancelar el cable o el movimiento en curso
        return;
      }
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
