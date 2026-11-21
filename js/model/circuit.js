/**
 * Circuit: estado del circuito dibujado (componentes y cables) y operaciones sobre él.
 *
 * Patrón Observador: quien necesite enterarse de los cambios (el lienzo, la tabla de
 * resultados) se suscribe con onChange(). Así el modelo no conoce a la interfaz y la
 * interfaz no modifica datos por su cuenta: toda modificación pasa por aquí.
 *
 * Patrón Memento (deshacer/rehacer): antes de cada cambio se guarda una copia del
 * estado en la pila `undoStack`. Deshacer = volver a la última copia.
 *
 * Responsable: P2. Creado por P1 con lo que necesita el editor.
 * Pendiente para P2: validaciones de valores, guardar/cargar (storage.js).
 */
import { computeTerminals, withTerminals } from '../editor/geometry.js';

/** Valor inicial de cada componente nuevo (unidades SI). */
const DEFAULT_VALUES = { R: 1000, C: 1e-6, L: 0.01, V: 5, VAC: 5, I: 0.001 };

/** Máximo de pasos que se pueden deshacer (limita el uso de memoria). */
const HISTORY_LIMIT = 100;

// ===================== Geometría auxiliar =====================

const samePoint = (a, b) => a.x === b.x && a.y === b.y;

/**
 * ¿El punto p está sobre el segmento a–b, sin ser uno de sus extremos?
 * Colineal: el producto cruz (b − a) × (p − a) vale 0.
 * Entre a y b: el producto punto (p − a)·(p − b) es negativo.
 * Las coordenadas son enteras (cuadrícula), así que la comparación con 0 es exacta.
 */
function isInsideSegment(p, a, b) {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (cross !== 0) return false;
  const dot = (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y);
  return dot < 0;
}

/** ¿El punto p está sobre el segmento a–b, incluyendo sus extremos? */
const isOnSegment = (p, a, b) => samePoint(p, a) || samePoint(p, b) || isInsideSegment(p, a, b);

/** Parte el segmento a–b en los puntos dados que estén dentro de él, ordenados desde a. */
function splitSegment(a, b, points) {
  // Sin duplicados: un mismo punto puede venir de varios cables o terminales,
  // y cortarlo dos veces produciría un tramo de longitud cero.
  const unique = [...new Map(points.map((p) => [`${p.x},${p.y}`, p])).values()];
  const cuts = unique
    .filter((p) => isInsideSegment(p, a, b))
    .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
  const chain = [a, ...cuts, b];
  return chain.slice(1).map((point, i) => ({ from: { ...chain[i] }, to: { ...point } }));
}

const isHorizontal = (component) => (component.rotation ?? 0) % 180 === 0;

/**
 * Rectángulo que ocupa un componente en el lienzo (para detectar si se encima con otro).
 * Igual al área de clic definida en components.js.
 */
function boundingBox(component) {
  const { x, y } = component;
  if (component.type === 'GND') return { x1: x - 12, y1: y, x2: x + 12, y2: y + 20 };
  return isHorizontal(component)
    ? { x1: x - 40, y1: y - 16, x2: x + 40, y2: y + 16 }
    : { x1: x - 16, y1: y - 40, x2: x + 16, y2: y + 40 };
}

/**
 * Intersección ESTRICTA: dos componentes que solo se tocan en el borde (terminal
 * con terminal, uno a continuación del otro) no cuentan como encimados.
 */
const boxesOverlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** Mayor número usado en los id con ese prefijo (R1, R3 → 3). */
function maxIdNumber(items, prefix) {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const used = items
    .map((item) => item.id.match(pattern))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return Math.max(0, ...used);
}

// ===================== Clase Circuit =====================

export class Circuit {
  constructor({ components = [], wires = [] } = {}) {
    this.components = components.map((c) => ({ rotation: 0, ...c }));
    this.wires = wires.map((w) => ({ ...w, from: { ...w.from }, to: { ...w.to } }));
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    /** Arrastre en curso: { id, base (estado al empezar), recorded } */
    this.dragState = null;
  }

  // ---------- Observador ----------

  /** @returns {Function} función para cancelar la suscripción */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => listener(this));
  }

  // ---------- Historial (deshacer / rehacer) ----------

  snapshot() {
    // structuredClone hace una copia profunda: modificar el estado actual no altera la copia.
    return structuredClone({ components: this.components, wires: this.wires });
  }

  restore(state) {
    const copy = structuredClone(state);
    this.components = copy.components;
    this.wires = copy.wires;
  }

  /** Guarda el estado actual antes de modificarlo. Un cambio nuevo invalida lo que se podía rehacer. */
  record(state = this.snapshot()) {
    this.undoStack.push(state);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo() { return this.undoStack.length > 0; }

  get canRedo() { return this.redoStack.length > 0; }

  undo() {
    if (!this.canUndo) return false;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.notify();
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.notify();
    return true;
  }

  // ---------- Consultas ----------

  /** CircuitModel con terminales calculados (contrato §5.2), listo para dibujar o para la netlist. */
  toModel() {
    return withTerminals({ components: this.components, wires: this.wires });
  }

  getComponent(id) {
    return this.components.find((c) => c.id === id) ?? null;
  }

  getWire(id) {
    return this.wires.find((w) => w.id === id) ?? null;
  }

  /** Todos los puntos donde algo se puede conectar: terminales y extremos de cables. */
  connectionPoints() {
    const points = this.toModel().components.flatMap((c) => c.terminals);
    this.wires.forEach((w) => points.push(w.from, w.to));
    return points;
  }

  /** ¿El componente se encima con algún otro? */
  overlaps(component) {
    const box = boundingBox(component);
    return this.components.some((other) => other.id !== component.id && boxesOverlap(box, boundingBox(other)));
  }

  /** ¿Cabe un componente de ese tipo en esa posición sin encimarse? */
  isFree(type, x, y, rotation = 0) {
    return !this.overlaps({ id: null, type, x, y, rotation });
  }

  // ---------- Componentes ----------

  /** Agrega un componente nuevo con id automático (R1, R2…) y valor por defecto. */
  addComponent(type, x, y) {
    this.record();
    const component = { id: this.nextId(type), type, x, y, rotation: 0 };
    if (type !== 'GND') component.value = DEFAULT_VALUES[type];
    this.components.push(component);
    this.notify();
    return component;
  }

  /**
   * Arrastre en 3 etapas: startDrag → dragTo (muchas veces) → endDrag.
   *
   * Cada dragTo parte del estado que había al EMPEZAR el arrastre (dragState.base).
   * Así los cables se recalculan en L desde cero en cada movimiento y los codos no se
   * acumulan. Todo el arrastre queda como UN solo paso en el historial.
   */
  startDrag(id) {
    if (!this.getComponent(id)) return;
    this.dragState = { id, base: this.snapshot(), recorded: false };
  }

  dragTo(x, y) {
    const drag = this.dragState;
    if (!drag) return;
    const original = drag.base.components.find((c) => c.id === drag.id);
    const current = this.getComponent(drag.id);
    if (current.x === x && current.y === y) return;

    // El historial se guarda solo cuando el componente realmente se mueve:
    // un clic para seleccionar no debe crear un paso de "deshacer".
    if (!drag.recorded) {
      this.record(structuredClone(drag.base));
      drag.recorded = true;
    }

    this.restore(drag.base);
    const component = this.getComponent(drag.id);
    if (original.x !== x || original.y !== y) {
      this.relocate(component, () => { component.x = x; component.y = y; });
    }
    this.notify();
  }

  /**
   * Termina el arrastre.
   * @returns {'unchanged'|'reverted'|'moved'}
   *   reverted: quedó encima de otro componente y volvió a su posición original.
   */
  endDrag() {
    const drag = this.dragState;
    if (!drag) return 'unchanged';
    this.dragState = null;

    const component = this.getComponent(drag.id);
    const original = drag.base.components.find((c) => c.id === drag.id);
    const unchanged = component.x === original.x && component.y === original.y;

    if (unchanged || this.overlaps(component)) {
      if (drag.recorded) this.undoStack.pop(); // no hubo cambio real: se descarta el paso
      this.restore(drag.base);
      this.notify();
      return unchanged ? 'unchanged' : 'reverted';
    }

    this.connectTerminalsToWires(component);
    this.notify();
    return 'moved';
  }

  /** Gira 90° en sentido horario. No gira si quedaría encima de otro componente. */
  rotateComponent(id) {
    const component = this.getComponent(id);
    if (!component || component.type === 'GND') return false;
    if (this.overlaps({ ...component, rotation: (component.rotation + 90) % 360 })) return false;

    this.record();
    this.relocate(component, () => { component.rotation = (component.rotation + 90) % 360; });
    this.connectTerminalsToWires(component);
    this.notify();
    return true;
  }

  /** Elimina el componente. Sus cables quedan en el lienzo (sueltos) para no perder trabajo. */
  removeComponent(id) {
    if (!this.getComponent(id)) return;
    this.record();
    this.components = this.components.filter((c) => c.id !== id);
    this.notify();
  }

  // ---------- Cables ----------

  /**
   * Agrega un cable formado por varios tramos rectos: [inicio, codo, fin].
   *
   * Aplica la regla de conexión del editor (ARQUITECTURA.md §5.2):
   *  - Si un terminal o extremo de cable existente queda EN MEDIO de un tramo nuevo,
   *    el tramo nuevo se parte ahí (se conecta).
   *  - Si un extremo del cable nuevo queda EN MEDIO de un cable existente (forma de T),
   *    el cable existente se parte ahí (se conecta).
   *  - Dos cables que solo se cruzan (forma de X) no se conectan.
   * Partir los cables garantiza que la netlist solo tenga que comparar coordenadas iguales.
   *
   * @param {Array<{x:number,y:number}>} points
   * @returns {number} cantidad de tramos creados
   */
  addWirePath(points) {
    const path = points.filter((p, i) => i === 0 || !samePoint(p, points[i - 1]));
    if (path.length < 2) return 0;

    // 1. Tramos nuevos, partidos en los puntos de conexión existentes.
    const existingPoints = this.connectionPoints();
    const newSegments = path
      .slice(1)
      .flatMap((point, i) => splitSegment(path[i], point, existingPoints))
      .filter((s) => !this.isCoveredByWire(s));
    if (newSegments.length === 0) return 0;

    this.record();
    const newId = this.wireIdGenerator();

    // 2. Cables existentes, partidos donde caen los extremos de los tramos nuevos.
    this.splitWiresAt(newSegments.flatMap((s) => [s.from, s.to]), newId);

    // 3. Se agregan los tramos nuevos.
    for (const segment of newSegments) {
      this.wires.push({ id: newId(), ...segment });
    }
    this.notify();
    return newSegments.length;
  }

  removeWire(id) {
    if (!this.getWire(id)) return;
    this.record();
    this.wires = this.wires.filter((w) => w.id !== id);
    this.notify();
  }

  /**
   * ¿El tramo ya está cubierto por un cable existente? Cubre el caso de un cable
   * repetido y el de un tramo que queda encima de parte de otro cable (superpuesto).
   * Como el segmento es recto, basta con que sus dos extremos estén sobre el cable.
   */
  isCoveredByWire({ from, to }) {
    return this.wires.some((w) => isOnSegment(from, w.from, w.to) && isOnSegment(to, w.from, w.to));
  }

  // ---------- Internos ----------

  /**
   * Aplica `change` (mover o rotar) y arrastra los cables conectados a los terminales.
   *
   * Para cada cable con UN extremo en el componente:
   *   - si sigue siendo horizontal o vertical, solo se mueve ese extremo;
   *   - si quedaría en diagonal, se reemplaza por una L de dos tramos. El tramo que
   *     toca el componente sale en la misma dirección que el componente
   *     (horizontal si el componente es horizontal), como en un diagrama a mano;
   *   - si el extremo cae justo sobre el otro extremo, el cable desaparece (longitud cero).
   * Si el cable tiene AMBOS extremos en el componente, los dos se mueven con él.
   */
  relocate(component, change) {
    const before = computeTerminals(component);
    change();
    const after = computeTerminals(component);
    const horizontal = isHorizontal(component);
    const terminalIndex = (point) => before.findIndex((t) => samePoint(t, point));
    const newId = this.wireIdGenerator();

    this.wires = this.wires.flatMap((wire) => {
      const fromIndex = terminalIndex(wire.from);
      const toIndex = terminalIndex(wire.to);
      if (fromIndex === -1 && toIndex === -1) return [wire];
      if (fromIndex !== -1 && toIndex !== -1) {
        return [{ ...wire, from: { ...after[fromIndex] }, to: { ...after[toIndex] } }];
      }

      const moved = { ...after[fromIndex !== -1 ? fromIndex : toIndex] };
      const fixed = { ...(fromIndex !== -1 ? wire.to : wire.from) };
      if (samePoint(moved, fixed)) return [];
      if (moved.x === fixed.x || moved.y === fixed.y) {
        return [{ id: wire.id, from: fixed, to: moved }];
      }
      const elbow = horizontal ? { x: fixed.x, y: moved.y } : { x: moved.x, y: fixed.y };
      return [{ id: wire.id, from: fixed, to: elbow }, { id: newId(), from: { ...elbow }, to: moved }];
    });
  }

  /**
   * Si un terminal del componente quedó en medio de un cable, parte el cable ahí para
   * conectarlo (misma regla de la T que al trazar cables).
   */
  connectTerminalsToWires(component) {
    this.splitWiresAt(computeTerminals(component), this.wireIdGenerator());
  }

  /** Parte los cables existentes en los puntos dados que caigan en medio de ellos. */
  splitWiresAt(points, newId) {
    this.wires = this.wires.flatMap((wire) => {
      const pieces = splitSegment(wire.from, wire.to, points);
      if (pieces.length === 1) return [wire];
      return pieces.map((piece, i) => ({ ...piece, id: i === 0 ? wire.id : newId() }));
    });
  }

  /**
   * Generador de id de cables para una operación completa. Usa un contador propio
   * en vez de recalcular el máximo cada vez, para no repetir id cuando una misma
   * operación crea varios tramos.
   */
  wireIdGenerator() {
    let last = maxIdNumber(this.wires, 'W');
    return () => `W${++last}`;
  }

  /** Siguiente id libre para el tipo: si existen R1 y R3, devuelve R4. */
  nextId(type) {
    return `${type}${maxIdNumber(this.components, type) + 1}`;
  }
}
