/**
 * Conversión CircuitModel (el dibujo) → Netlist (lo que entiende el motor).
 *
 * Idea: dos puntos del dibujo pertenecen al mismo nodo eléctrico si están unidos por
 * cables, directa o indirectamente. Para agruparlos se usa la estructura
 * Union-Find (conjuntos disjuntos):
 *   - Cada punto (x, y) empieza en su propio conjunto.
 *   - Cada cable une (union) el conjunto de su inicio con el de su final.
 *   - Al terminar, cada conjunto es un nodo.
 *
 * Regla del contrato (ARQUITECTURA.md §5.2): solo se conectan puntos con las MISMAS
 * coordenadas. Un cable que pasa por encima de un terminal sin terminar en él NO lo conecta.
 */

/** Clave única de un punto del dibujo. */
const keyOf = (point) => `${point.x},${point.y}`;

class UnionFind {
  constructor() {
    this.parent = new Map();
  }

  /** Representante del conjunto al que pertenece `key` (lo crea si no existe). */
  find(key) {
    if (!this.parent.has(key)) this.parent.set(key, key);
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    // Compresión de camino: los nodos visitados apuntan directo a la raíz
    // para que las próximas búsquedas sean más rápidas.
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current);
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

export class NetlistError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetlistError';
  }
}

/**
 * @param {{components: Array, wires: Array}} model  CircuitModel con terminales calculados
 * @returns {{nodeCount: number, components: Array}}  Netlist (ARQUITECTURA.md §5.3)
 */
export function buildNetlist(model) {
  const sets = new UnionFind();

  for (const wire of model.wires) {
    sets.union(keyOf(wire.from), keyOf(wire.to));
  }
  for (const comp of model.components) {
    comp.terminals.forEach((t) => sets.find(keyOf(t)));
  }

  const grounds = model.components.filter((c) => c.type === 'GND');
  if (grounds.length === 0) {
    throw new NetlistError('El circuito no tiene tierra (GND). Agrega una para tener la referencia de 0 V.');
  }

  // Asignación de números de nodo: el conjunto de la tierra es el 0.
  // Si hay varias tierras, todas forman el mismo nodo 0.
  const nodeNumberOf = new Map();
  for (const gnd of grounds) {
    nodeNumberOf.set(sets.find(keyOf(gnd.terminals[0])), 0);
  }
  let nextNode = 1;
  const nodeOf = (point) => {
    const root = sets.find(keyOf(point));
    if (!nodeNumberOf.has(root)) nodeNumberOf.set(root, nextNode++);
    return nodeNumberOf.get(root);
  };

  const components = model.components
    .filter((c) => c.type !== 'GND')
    .map((c) => ({
      id: c.id,
      type: c.type,
      n1: nodeOf(c.terminals[0]),
      n2: nodeOf(c.terminals[1]),
      value: c.value,
      ...(c.phase !== undefined && { phase: c.phase }),
    }));

  return { nodeCount: nextNode, components };
}
