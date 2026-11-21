/**
 * Circuit: estado del circuito dibujado (componentes y cables) y operaciones sobre él.
 *
 * Patrón Observador: quien necesite enterarse de los cambios (el lienzo, la tabla de
 * resultados) se suscribe con onChange(). Así el modelo no conoce a la interfaz y la
 * interfaz no modifica datos por su cuenta: toda modificación pasa por aquí.
 *
 * Responsable: P2. Creado en la fase 2 con lo mínimo que necesita el editor (P1).
 * Pendiente para P2: validaciones de valores, guardar/cargar (storage.js).
 */
import { computeTerminals, withTerminals } from '../editor/geometry.js';

/** Valor inicial de cada componente nuevo (unidades SI). */
const DEFAULT_VALUES = { R: 1000, C: 1e-6, L: 0.01, V: 5, VAC: 5, I: 0.001 };

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

export class Circuit {
  constructor({ components = [], wires = [] } = {}) {
    this.components = components.map((c) => ({ rotation: 0, ...c }));
    this.wires = wires.map((w) => ({ ...w, from: { ...w.from }, to: { ...w.to } }));
    this.listeners = new Set();
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

  // ---------- Operaciones ----------

  /** Agrega un componente nuevo con id automático (R1, R2…) y valor por defecto. */
  addComponent(type, x, y) {
    const component = { id: this.nextId(type), type, x, y, rotation: 0 };
    if (type !== 'GND') component.value = DEFAULT_VALUES[type];
    this.components.push(component);
    this.notify();
    return component;
  }

  /** Mueve un componente. Los cables conectados a sus terminales lo siguen. */
  moveComponent(id, x, y) {
    const component = this.getComponent(id);
    if (!component || (component.x === x && component.y === y)) return;
    this.updateKeepingWires(component, () => {
      component.x = x;
      component.y = y;
    });
  }

  /** Gira 90° en sentido horario. Los cables conectados lo siguen. */
  rotateComponent(id) {
    const component = this.getComponent(id);
    if (!component || component.type === 'GND') return;
    this.updateKeepingWires(component, () => {
      component.rotation = (component.rotation + 90) % 360;
    });
  }

  /** Elimina el componente. Sus cables quedan en el lienzo (sueltos) para no perder trabajo. */
  removeComponent(id) {
    const before = this.components.length;
    this.components = this.components.filter((c) => c.id !== id);
    if (this.components.length !== before) this.notify();
  }

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

    // Contador único para toda la operación: evita repetir id al crear varios tramos.
    let lastNumber = maxIdNumber(this.wires, 'W');
    const newId = () => `W${++lastNumber}`;

    // 2. Cables existentes, partidos donde caen los extremos de los tramos nuevos.
    const newEnds = newSegments.flatMap((s) => [s.from, s.to]);
    this.wires = this.wires.flatMap((wire) => {
      const pieces = splitSegment(wire.from, wire.to, newEnds);
      if (pieces.length === 1) return [wire];
      return pieces.map((piece, i) => ({ ...piece, id: i === 0 ? wire.id : newId() }));
    });

    // 3. Se agregan los tramos nuevos.
    for (const segment of newSegments) {
      this.wires.push({ id: newId(), ...segment });
    }
    this.notify();
    return newSegments.length;
  }

  removeWire(id) {
    const before = this.wires.length;
    this.wires = this.wires.filter((w) => w.id !== id);
    if (this.wires.length !== before) this.notify();
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
   * Aplica `change` al componente y arrastra con él los extremos de cable que
   * estaban sobre sus terminales, para que no se desconecte al moverlo o rotarlo.
   */
  updateKeepingWires(component, change) {
    const before = computeTerminals(component);
    change();
    const after = computeTerminals(component);

    for (const wire of this.wires) {
      for (const end of [wire.from, wire.to]) {
        const index = before.findIndex((t) => t.x === end.x && t.y === end.y);
        if (index !== -1) {
          end.x = after[index].x;
          end.y = after[index].y;
        }
      }
    }
    this.notify();
  }

  /** Siguiente id libre para el tipo: si existen R1 y R3, devuelve R4. */
  nextId(type) {
    return `${type}${maxIdNumber(this.components, type) + 1}`;
  }

  nextWireId() {
    return `W${maxIdNumber(this.wires, 'W') + 1}`;
  }
}

/** Mayor número usado en los id con ese prefijo (R1, R3 → 3). */
function maxIdNumber(items, prefix) {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const used = items
    .map((item) => item.id.match(pattern))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return Math.max(0, ...used);
}
