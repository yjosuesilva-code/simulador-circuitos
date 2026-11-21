/**
 * Presentación de resultados en tablas (Bootstrap).
 *
 * Fase 1: resultados DC. Pendiente para P4: AC (magnitud/fase) y transitorio (gráficas).
 */
import { formatValue } from '../model/units.js';

/**
 * Escapa texto antes de insertarlo con innerHTML. Los id vienen de archivos JSON que
 * el usuario puede cargar; sin esto, un id como "<img onerror=...>" ejecutaría código (XSS).
 */
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const TYPE_NAMES = {
  R: 'Resistencia', C: 'Capacitor', L: 'Inductor',
  V: 'Fuente DC', VAC: 'Fuente AC', I: 'Fuente de corriente',
};

/**
 * @param {HTMLElement} container
 * @param {{components: Array}} netlist
 * @param {{nodeVoltages: number[], currents: Object}} result
 */
export function renderDCResults(container, netlist, result) {
  const { nodeVoltages, currents } = result;

  const nodeRows = nodeVoltages
    .map((v, node) => `
      <tr>
        <td>${node === 0 ? '0 <span class="text-body-secondary">(tierra)</span>' : node}</td>
        <td class="text-end font-monospace">${formatValue(v, 'V')}</td>
      </tr>`)
    .join('');

  let totalPower = 0;
  let largestPower = 0;
  const componentRows = netlist.components
    .map((c) => {
      const voltage = nodeVoltages[c.n1] - nodeVoltages[c.n2];
      const current = currents[c.id];
      const power = voltage * current;
      totalPower += power;
      largestPower = Math.max(largestPower, Math.abs(power));
      return `
        <tr>
          <td><strong>${escapeHtml(c.id)}</strong><br><small class="text-body-secondary">${TYPE_NAMES[c.type] ?? escapeHtml(c.type)}</small></td>
          <td class="text-center font-monospace">${c.n1}→${c.n2}</td>
          <td class="text-end font-monospace">${formatValue(voltage, 'V')}</td>
          <td class="text-end font-monospace">${formatValue(current, 'A')}</td>
          <td class="text-end font-monospace ${power < -1e-12 ? 'text-success' : ''}">${formatValue(power, 'W')}</td>
        </tr>`;
    })
    .join('');

  // La suma no da exactamente 0 porque las conductancias GMIN (mna.js) disipan unos
  // picovatios. Si es despreciable frente a las potencias del circuito, se muestra 0.
  const powerBalance = Math.abs(totalPower) < 1e-6 * largestPower ? 0 : totalPower;

  container.innerHTML = `
    <h3 class="h6 text-uppercase text-body-secondary mt-1">Voltaje en los nodos</h3>
    <table class="table table-sm align-middle mb-4">
      <thead><tr><th>Nodo</th><th class="text-end">Voltaje</th></tr></thead>
      <tbody>${nodeRows}</tbody>
    </table>

    <h3 class="h6 text-uppercase text-body-secondary">Componentes</h3>
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead>
          <tr>
            <th>Componente</th><th class="text-center">Nodos</th>
            <th class="text-end">Voltaje</th><th class="text-end">Corriente</th><th class="text-end">Potencia</th>
          </tr>
        </thead>
        <tbody>${componentRows}</tbody>
        <tfoot>
          <tr class="table-light">
            <td colspan="4" class="text-end"><small>Suma de potencias (debe ser 0)</small></td>
            <td class="text-end font-monospace">${formatValue(powerBalance, 'W')}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="small text-body-secondary mb-0">
      Corriente positiva: circula de n1 a n2 por dentro del componente.
      Potencia negativa (en verde): el componente entrega energía.
    </p>`;
}

export function renderError(container, error) {
  container.innerHTML = `
    <div class="alert alert-danger mb-0" role="alert">
      <strong>No se pudo simular.</strong><br>${escapeHtml(error.message)}
    </div>`;
}
