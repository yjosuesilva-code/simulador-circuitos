/**
 * Geometría de los componentes: dónde quedan sus terminales según posición y rotación.
 *
 * Este archivo NO toca el DOM (no dibuja nada), así que se puede usar y probar
 * sin navegador. El dibujo está en components.js.
 *
 * Convención: un componente de 2 terminales ocupa 4 celdas de la cuadrícula a lo largo
 * del eje x local (de -40 a +40 px). Con rotation = 90 queda vertical.
 */

export const GRID_SIZE = 20;

/** Mitad del largo de un componente de 2 terminales (2 celdas de la cuadrícula). */
export const HALF_LENGTH = 2 * GRID_SIZE;

/** Terminales en coordenadas locales (antes de rotar y trasladar). */
const LOCAL_TERMINALS = {
  TWO_TERMINAL: [{ x: -HALF_LENGTH, y: 0 }, { x: HALF_LENGTH, y: 0 }],
  GND: [{ x: 0, y: 0 }],
};

/**
 * Rota un punto en múltiplos de 90° con la misma convención de SVG `rotate()`
 * (sentido horario, porque en pantalla el eje y apunta hacia abajo).
 * Con ángulos rectos se usan senos/cosenos exactos (0, 1, -1) para no generar
 * decimales como 1.2e-16 que romperían la comparación de coordenadas.
 */
function rotate({ x, y }, degrees) {
  const quarterTurns = (((Math.round(degrees / 90)) % 4) + 4) % 4;
  const cos = [1, 0, -1, 0][quarterTurns];
  const sin = [0, 1, 0, -1][quarterTurns];
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** Terminales en coordenadas del lienzo. */
export function computeTerminals(component) {
  const local = component.type === 'GND' ? LOCAL_TERMINALS.GND : LOCAL_TERMINALS.TWO_TERMINAL;
  return local.map((point) => {
    const r = rotate(point, component.rotation ?? 0);
    return { x: component.x + r.x, y: component.y + r.y };
  });
}

/** Devuelve una copia del modelo con los terminales de cada componente calculados. */
export function withTerminals(model) {
  return {
    ...model,
    components: model.components.map((c) => ({ ...c, terminals: computeTerminals(c) })),
  };
}
