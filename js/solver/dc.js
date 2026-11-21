/**
 * Análisis DC (régimen estable con fuentes constantes).
 *
 * Comportamiento de cada componente en DC:
 *   R   → conductancia 1/R
 *   C   → circuito abierto (no aporta nada; su corriente es 0)
 *   L   → cortocircuito (fuente de voltaje de 0 V, para conocer su corriente)
 *   V   → fuente de voltaje
 *   VAC → fuente de 0 V (su valor promedio es cero)
 *   I   → fuente de corriente
 */
import { MnaSystem } from './mna.js';
import { solveLinearSystem } from './linear.js';

/** Tipos que necesitan una rama extra (su corriente es incógnita) en DC. */
const BRANCH_TYPES = new Set(['V', 'VAC', 'L']);

/**
 * @param {{nodeCount: number, components: Array}} netlist  ver ARQUITECTURA.md §5.3
 * @returns {{mode: 'dc', nodeVoltages: number[], currents: Object<string, number>}}
 */
export function solveDC(netlist) {
  const { nodeCount, components } = netlist;

  // Cada componente con rama extra recibe un índice k = 0, 1, 2...
  const branchOf = new Map();
  for (const comp of components) {
    if (BRANCH_TYPES.has(comp.type)) branchOf.set(comp.id, branchOf.size);
  }

  const system = new MnaSystem(nodeCount, branchOf.size);

  for (const comp of components) {
    const { n1, n2, value } = comp;
    switch (comp.type) {
      case 'R':
        system.addConductance(n1, n2, 1 / value);
        break;
      case 'C':
        break; // abierto en DC
      case 'L':
      case 'VAC':
        system.addVoltageSource(n1, n2, 0, branchOf.get(comp.id));
        break;
      case 'V':
        system.addVoltageSource(n1, n2, value, branchOf.get(comp.id));
        break;
      case 'I':
        system.addCurrentSource(n1, n2, value);
        break;
      default:
        throw new Error(`Tipo de componente no soportado en DC: "${comp.type}" (${comp.id})`);
    }
  }

  const x = solveLinearSystem(system.A, system.b);
  const nodeVoltages = system.nodeVoltagesFrom(x);

  const currents = {};
  for (const comp of components) {
    currents[comp.id] = currentThrough(comp, nodeVoltages, x, system, branchOf);
  }

  return { mode: 'dc', nodeVoltages, currents };
}

/** Corriente que circula por dentro del componente de n1 hacia n2. */
function currentThrough(comp, nodeVoltages, x, system, branchOf) {
  switch (comp.type) {
    case 'R':
      return (nodeVoltages[comp.n1] - nodeVoltages[comp.n2]) / comp.value;
    case 'C':
      return 0;
    case 'I':
      return comp.value;
    default: // V, VAC, L: la corriente es una incógnita del sistema
      return system.branchCurrentFrom(x, branchOf.get(comp.id));
  }
}
