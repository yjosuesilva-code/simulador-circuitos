/**
 * Unidades y prefijos del Sistema Internacional.
 *   formatValue(0.0047, 'A') → "4.7 mA"
 *   parseValue('4.7k')       → 4700
 */

const PREFIXES = [
  { symbol: 'G', factor: 1e9 },
  { symbol: 'M', factor: 1e6 },
  { symbol: 'k', factor: 1e3 },
  { symbol: '',  factor: 1 },
  { symbol: 'm', factor: 1e-3 },
  { symbol: 'µ', factor: 1e-6 },
  { symbol: 'n', factor: 1e-9 },
  { symbol: 'p', factor: 1e-12 },
];

/** Unidad de cada tipo de componente (ARQUITECTURA.md §5.1). */
export const UNIT_BY_TYPE = { R: 'Ω', C: 'F', L: 'H', V: 'V', VAC: 'V', I: 'A' };

/** Por debajo de este valor se muestra 0 (evita "-0.000000000001 V" por redondeo). */
const ZERO_THRESHOLD = 1e-12;

/**
 * @param {number} value
 * @param {string} unit
 * @param {number} digits cifras significativas
 */
export function formatValue(value, unit = '', digits = 4) {
  if (!Number.isFinite(value)) return `— ${unit}`;
  if (Math.abs(value) < ZERO_THRESHOLD) return `0 ${unit}`;

  const abs = Math.abs(value);
  const prefix = PREFIXES.find((p) => abs >= p.factor) ?? PREFIXES[PREFIXES.length - 1];
  const scaled = value / prefix.factor;
  // Number(...) quita ceros sobrantes: 4.700 → 4.7
  return `${Number(scaled.toPrecision(digits))} ${prefix.symbol}${unit}`;
}

/**
 * Convierte texto con prefijo a número. Acepta "u" como alias de "µ".
 * @returns {number} NaN si el texto no es válido
 */
export function parseValue(text) {
  const match = String(text).trim().match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([GMkmµunp]?)/i);
  if (!match) return NaN;
  const [, number, rawPrefix] = match;
  // "M" (mega) y "m" (mili) se distinguen por mayúscula; el resto no.
  const ALIASES = { u: 'µ', U: 'µ', K: 'k', g: 'G', N: 'n', P: 'p' };
  const symbol = ALIASES[rawPrefix] ?? rawPrefix;
  const prefix = PREFIXES.find((p) => p.symbol === symbol);
  return prefix ? Number(number) * prefix.factor : NaN;
}
