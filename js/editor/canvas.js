/**
 * Lienzo del editor: cuadrícula, cables y componentes.
 *
 * Solo DIBUJA el estado que recibe; no decide nada. La interacción con el mouse
 * está en interaction.js. Separarlos permite cambiar uno sin romper el otro.
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
    this.ghostLayer = svgElement('g', { class: 'layer-ghost' });
    this.svg.append(this.wireLayer, this.componentLayer, this.labelLayer, this.ghostLayer);
  }

  /** Fondo de puntos con <pattern>: se dibuja una sola celda y SVG la repite. */
  drawGrid() {
    const defs = svgElement('defs');
    const pattern = svgElement('pattern', {
      id: 'grid-pattern', width: GRID_SIZE, height: GRID_SIZE, patternUnits: 'userSpaceOnUse',
    });
    pattern.appendChild(svgElement('circle', { cx: 0, cy: 0, r: 1, class: 'grid-dot' }));
    defs.appendChild(pattern);
    this.svg.append(defs, svgElement('rect', {
      class: 'grid-background', width: '100%', height: '100%', fill: 'url(#grid-pattern)',
    }));
  }

  /**
   * Dibuja el circuito completo, reemplazando lo que hubiera.
   * @param {{components: Array, wires: Array}} model CircuitModel con terminales
   * @param {{selectedId?: string|null}} view estado visual (qué está seleccionado)
   */
  render(model, { selectedId = null } = {}) {
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
      const selected = component.id === selectedId;
      this.componentLayer.appendChild(createComponentElement(component, { selected }));
      const label = createLabelElement(component);
      if (label) this.labelLayer.appendChild(label);
    }
  }

  /** Vista previa semitransparente mientras se arrastra un componente desde la barra. */
  showGhost(component) {
    this.ghostLayer.replaceChildren(createComponentElement(component, { ghost: true }));
  }

  hideGhost() {
    this.ghostLayer.replaceChildren();
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

  /** Convierte coordenadas de pantalla (evento del mouse) a coordenadas del dibujo SVG. */
  toSvgPoint(clientX, clientY) {
    const point = new DOMPoint(clientX, clientY).matrixTransform(this.svg.getScreenCTM().inverse());
    return { x: point.x, y: point.y };
  }

  /** ¿El punto (en coordenadas SVG) cae dentro del área visible del lienzo? */
  contains({ x, y }) {
    const { x: vx, y: vy, width, height } = this.svg.viewBox.baseVal;
    return x >= vx && x <= vx + width && y >= vy && y <= vy + height;
  }
}
