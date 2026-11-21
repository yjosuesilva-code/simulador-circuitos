/**
 * Resolución de sistemas de ecuaciones lineales A·x = b.
 *
 * Método: eliminación de Gauss con pivoteo parcial.
 *   1. Eliminación hacia adelante: se convierte A en una matriz triangular superior.
 *   2. Sustitución hacia atrás: se despejan las incógnitas desde la última hasta la primera.
 *
 * "Pivoteo parcial" = en cada columna se usa como pivote la fila con el valor absoluto
 * más grande. Así se evita dividir entre números muy pequeños, que amplifican el error
 * de redondeo.
 *
 * NOTA (fase 3, P3): esta versión trabaja con números reales. Para el análisis AC
 * habrá que generalizarla a números complejos (clase Complex).
 */

/** Por debajo de este valor un pivote se considera cero (la matriz no tiene solución única). */
const PIVOT_TOLERANCE = 1e-20;

export class SingularMatrixError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SingularMatrixError';
  }
}

/**
 * @param {number[][]} A  matriz cuadrada n×n (no se modifica)
 * @param {number[]}   b  vector de términos independientes (no se modifica)
 * @returns {number[]} vector solución x
 * @throws {SingularMatrixError} si el sistema no tiene solución única
 */
export function solveLinearSystem(A, b) {
  const n = b.length;

  // Matriz aumentada [A | b]. Se copia para no alterar los datos de quien llama.
  const M = A.map((row, i) => [...row, b[i]]);

  // 1. Eliminación hacia adelante
  for (let col = 0; col < n; col++) {
    const pivotRow = findPivotRow(M, col);

    if (Math.abs(M[pivotRow][col]) < PIVOT_TOLERANCE) {
      throw new SingularMatrixError(
        'El sistema no tiene solución única. Revisa que no haya fuentes de voltaje en paralelo ' +
        'o en lazo cerrado, ni partes del circuito sin conexión a tierra.'
      );
    }

    swapRows(M, col, pivotRow);

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        M[row][c] -= factor * M[col][c];
      }
    }
  }

  // 2. Sustitución hacia atrás
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let c = row + 1; c < n; c++) {
      sum -= M[row][c] * x[c];
    }
    x[row] = sum / M[row][row];
  }

  return x;
}

function findPivotRow(M, col) {
  let best = col;
  for (let row = col + 1; row < M.length; row++) {
    if (Math.abs(M[row][col]) > Math.abs(M[best][col])) best = row;
  }
  return best;
}

function swapRows(M, i, j) {
  if (i !== j) [M[i], M[j]] = [M[j], M[i]];
}
