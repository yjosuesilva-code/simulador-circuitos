/**
 * Análisis Nodal Modificado (MNA): construcción del sistema A·x = b.
 *
 * Incógnitas (vector x):
 *   - x[0 .. N-2]        → voltajes de los nodos 1..N-1 (la tierra, nodo 0, vale 0 V y no es incógnita)
 *   - x[N-1 .. N-1+M-1]  → corrientes de las M fuentes de voltaje (llamadas "ramas extra")
 *
 * Cada componente "estampa" (stamp) su aporte en A y b. Las funciones de este archivo
 * son esos stamps; dc.js, ac.js y transient.js deciden qué stamp usa cada componente.
 */

/**
 * Conductancia mínima (siemens) de cada nodo a tierra.
 * Evita que la matriz sea singular cuando un nodo queda "flotando"
 * (por ejemplo, conectado solo a través de un capacitor en DC).
 * Es tan pequeña (equivale a 1 TΩ) que no altera los resultados.
 */
export const GMIN = 1e-12;

export class MnaSystem {
  /**
   * @param {number} nodeCount   número total de nodos, incluyendo la tierra (nodo 0)
   * @param {number} branchCount número de ramas extra (fuentes de voltaje)
   */
  constructor(nodeCount, branchCount) {
    this.nodeCount = nodeCount;
    this.branchCount = branchCount;
    this.size = (nodeCount - 1) + branchCount;
    this.A = Array.from({ length: this.size }, () => new Array(this.size).fill(0));
    this.b = new Array(this.size).fill(0);

    for (let node = 1; node < nodeCount; node++) {
      this.addConductance(node, 0, GMIN);
    }
  }

  /** Fila/columna de la matriz que corresponde a un nodo. La tierra no tiene fila (-1). */
  nodeIndex(node) {
    return node - 1;
  }

  /** Fila/columna de la matriz que corresponde a la k-ésima rama extra. */
  branchIndex(k) {
    return (this.nodeCount - 1) + k;
  }

  /**
   * Stamp de una conductancia g = 1/R entre los nodos n1 y n2.
   *
   *         n1     n2
   *   n1 [  +g     -g ]
   *   n2 [  -g     +g ]
   */
  addConductance(n1, n2, g) {
    const i = this.nodeIndex(n1);
    const j = this.nodeIndex(n2);
    if (n1 !== 0) this.A[i][i] += g;
    if (n2 !== 0) this.A[j][j] += g;
    if (n1 !== 0 && n2 !== 0) {
      this.A[i][j] -= g;
      this.A[j][i] -= g;
    }
  }

  /**
   * Stamp de una fuente de corriente: `current` amperios circulan por dentro de la
   * fuente de n1 hacia n2. Es decir, la fuente saca corriente del nodo n1 y la
   * inyecta en el nodo n2.
   */
  addCurrentSource(n1, n2, current) {
    if (n1 !== 0) this.b[this.nodeIndex(n1)] -= current;
    if (n2 !== 0) this.b[this.nodeIndex(n2)] += current;
  }

  /**
   * Stamp de una fuente de voltaje V(n1) − V(n2) = voltage, usando la rama extra k.
   * La incógnita de la rama es la corriente que circula por dentro de la fuente de n1 a n2.
   */
  addVoltageSource(n1, n2, voltage, k) {
    const row = this.branchIndex(k);
    if (n1 !== 0) {
      const i = this.nodeIndex(n1);
      this.A[i][row] += 1;
      this.A[row][i] += 1;
    }
    if (n2 !== 0) {
      const j = this.nodeIndex(n2);
      this.A[j][row] -= 1;
      this.A[row][j] -= 1;
    }
    this.b[row] += voltage;
  }

  /** Convierte la solución x en voltajes por nodo (con la tierra en la posición 0). */
  nodeVoltagesFrom(x) {
    const voltages = [0];
    for (let node = 1; node < this.nodeCount; node++) {
      voltages.push(x[this.nodeIndex(node)]);
    }
    return voltages;
  }

  /** Corriente de la k-ésima rama extra en la solución x. */
  branchCurrentFrom(x, k) {
    return x[this.branchIndex(k)];
  }
}
