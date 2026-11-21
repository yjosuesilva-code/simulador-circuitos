/**
 * Lienzo del editor: cuadrícula, cables y componentes.
 *
 * Fase 1: render estático de un CircuitModel (sin interacción).
 * Pendiente para P1: arrastrar desde la barra, mover, rotar, borrar, trazar cables.
 */
import { GRID_SIZE } from './geometry.js';
import { svgElement, createComponentElement, createLabelElement } from './components.js';

export class CircuitCanvas {
  /** @param {SVGSVGElement} svg elemento <svg> donde se dibuja */
  constructor(svg) {
    this.svg = svg;
    this.drawGrid();
    this.wireLayer = svgElement('g', { class: 'layer-wires' });
    this.componentLayer = svgElement('g', { class: 'layer-components' });
    this.labelLayer = svgElement('g', { class: 'layer-labels' });
    this.svg.append(this.wireLayer, this.componentLayer, this.labelLayer);
  }

  /** Fondo de puntos con <pattern>: se dibuja una sola celda y SVG la repite. */
  drawGrid() {
    const defs = svgElement('defs');
    const pattern = svgElement('pattern', {
      id: 'grid-pattern', width: GRID_SIZE, height: GRID_SIZE, patternUnits: 'userSpaceOnUse',
    });
    pattern.appendChild(svgElement('circle', { cx: 0, cy: 0, r: 1, class: 'grid-dot' }));
    defs.appendChild(pattern);
    this.svg.append(defs, svgElement('rect', { width: '100%', height: '100%', fill: 'url(#grid-pattern)' }));
  }

  /** Dibuja el circuito completo, reemplazando lo que hubiera. */
  render(model) {
    this.wireLayer.replaceChildren();
    this.componentLayer.replaceChildren();
    this.labelLayer.replaceChildren();

    for (const wire of model.wires) {
      this.wireLayer.appendChild(svgElement('line', {
        class: 'wire', x1: wire.from.x, y1: wire.from.y, x2: wire.to.x, y2: wire.to.y,
      }));
    }
    this.drawJunctions(model);

    for (const component of model.components) {
      this.componentLayer.appendChild(createComponentElement(component));
      const label = createLabelElement(component);
      if (label) this.labelLayer.appendChild(label);
    }
  }

  /**
   * Punto de unión donde se encuentran 3 o más extremos (cables o terminales).
   * Es la convención de los diagramas eléctricos para indicar "aquí hay conexión".
   */
  drawJunctions(model) {
    const count = new Map();
    const add = (p) => count.set(`${p.x},${p.y}`, (count.get(`${p.x},${p.y}`) ?? 0) + 1);
    model.wires.forEach((w) => { add(w.from); add(w.to); });
    model.components.forEach((c) => c.terminals?.forEach(add));

    for (const [key, n] of count) {
      if (n < 3) continue;
      const [x, y] = key.split(',').map(Number);
      this.wireLayer.appendChild(svgElement('circle', { class: 'junction', cx: x, cy: y, r: 3.5 }));
    }
  }
}
