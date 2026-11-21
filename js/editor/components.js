/**
 * Dibujo SVG de cada tipo de componente.
 *
 * Cada símbolo se dibuja en coordenadas LOCALES: horizontal, centrado en (0, 0),
 * con los terminales en x = -40 y x = +40 (ver geometry.js). Después se aplica
 * `translate(x, y) rotate(rotation)` para ubicarlo en el lienzo.
 *
 * Fase 1: solo dibuja. Arrastrar, seleccionar y rotar es trabajo de P1.
 */
import { HALF_LENGTH } from './geometry.js';
import { formatValue, UNIT_BY_TYPE } from '../model/units.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Crea un elemento SVG con sus atributos. */
export function svgElement(tag, attributes = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

const L = HALF_LENGTH; // 40

/**
 * Trazos de cada símbolo. Cada función devuelve una lista de elementos SVG.
 * Para agregar un componente nuevo basta con agregar una entrada aquí.
 */
const SYMBOLS = {
  // Resistencia: zigzag entre x = -24 y x = 24
  R: () => [
    svgElement('polyline', {
      points: `${-L},0 -24,0 -20,-8 -12,8 -4,-8 4,8 12,-8 20,8 24,0 ${L},0`,
    }),
  ],

  // Fuente DC (símbolo de batería): placa larga = terminal + (n1), placa corta = − (n2)
  V: () => [
    svgElement('line', { x1: -L, y1: 0, x2: -4, y2: 0 }),
    svgElement('line', { x1: -4, y1: -14, x2: -4, y2: 14, class: 'plate' }),
    svgElement('line', { x1: 4, y1: -7, x2: 4, y2: 7, class: 'plate' }),
    svgElement('line', { x1: 4, y1: 0, x2: L, y2: 0 }),
  ],

  // Fuente AC: círculo con una onda senoidal
  VAC: () => [
    svgElement('line', { x1: -L, y1: 0, x2: -14, y2: 0 }),
    svgElement('circle', { cx: 0, cy: 0, r: 14 }),
    svgElement('path', { d: 'M -8 0 Q -4 -9 0 0 T 8 0' }),
    svgElement('line', { x1: 14, y1: 0, x2: L, y2: 0 }),
  ],

  // Fuente de corriente: círculo con flecha de n1 hacia n2
  I: () => [
    svgElement('line', { x1: -L, y1: 0, x2: -14, y2: 0 }),
    svgElement('circle', { cx: 0, cy: 0, r: 14 }),
    svgElement('line', { x1: -8, y1: 0, x2: 8, y2: 0 }),
    svgElement('polyline', { points: '3,-5 8,0 3,5' }),
    svgElement('line', { x1: 14, y1: 0, x2: L, y2: 0 }),
  ],

  // Capacitor: dos placas paralelas
  C: () => [
    svgElement('line', { x1: -L, y1: 0, x2: -4, y2: 0 }),
    svgElement('line', { x1: -4, y1: -12, x2: -4, y2: 12, class: 'plate' }),
    svgElement('line', { x1: 4, y1: -12, x2: 4, y2: 12, class: 'plate' }),
    svgElement('line', { x1: 4, y1: 0, x2: L, y2: 0 }),
  ],

  // Inductor: cuatro semicírculos (espiras)
  L: () => [
    svgElement('path', {
      d: `M ${-L} 0 H -24 a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0 H ${L}`,
    }),
  ],

  // Tierra: el terminal está en (0, 0) y las rayas debajo
  GND: () => [
    svgElement('line', { x1: 0, y1: 0, x2: 0, y2: 10 }),
    svgElement('line', { x1: -12, y1: 10, x2: 12, y2: 10 }),
    svgElement('line', { x1: -7, y1: 15, x2: 7, y2: 15 }),
    svgElement('line', { x1: -2, y1: 20, x2: 2, y2: 20 }),
  ],
};

/**
 * Rectángulo invisible que cubre el símbolo. Los trazos miden 2 px y serían muy
 * difíciles de atrapar con el mouse; este rectángulo amplía la zona de clic.
 */
function createHitArea(type) {
  return type === 'GND'
    ? svgElement('rect', { class: 'hit-area', x: -14, y: -4, width: 28, height: 28 })
    : svgElement('rect', { class: 'hit-area', x: -L, y: -16, width: 2 * L, height: 32 });
}

/**
 * Grupo SVG de un componente, ya ubicado y rotado en el lienzo.
 * @param {object} component
 * @param {{selected?: boolean, ghost?: boolean}} options
 */
export function createComponentElement(component, { selected = false, ghost = false } = {}) {
  const draw = SYMBOLS[component.type];
  if (!draw) throw new Error(`No hay símbolo para el tipo "${component.type}"`);

  const classes = ['component', `component-${component.type}`];
  if (selected) classes.push('selected');
  if (ghost) classes.push('ghost');

  const group = svgElement('g', {
    class: classes.join(' '),
    'data-id': component.id,
    transform: `translate(${component.x} ${component.y}) rotate(${component.rotation ?? 0})`,
  });
  group.appendChild(createHitArea(component.type));
  draw().forEach((el) => group.appendChild(el));
  return group;
}

/**
 * Etiqueta "R1 · 1 kΩ". Va fuera del grupo rotado para que el texto
 * siempre quede horizontal y legible.
 */
export function createLabelElement(component) {
  if (component.type === 'GND') return null;

  const vertical = Math.abs(component.rotation ?? 0) % 180 === 90;
  const label = svgElement('text', {
    class: 'component-label',
    x: vertical ? component.x + 20 : component.x,
    y: vertical ? component.y + 4 : component.y - 16,
    'text-anchor': vertical ? 'start' : 'middle',
  });
  const unit = UNIT_BY_TYPE[component.type];
  label.textContent = `${component.id} · ${formatValue(component.value, unit, 3)}`;
  return label;
}
