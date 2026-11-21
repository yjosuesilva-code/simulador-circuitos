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
    const pattern = new RegExp(`^${type}(\\d+)$`);
    const used = this.components
      .map((c) => c.id.match(pattern))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    return `${type}${Math.max(0, ...used) + 1}`;
  }
}
