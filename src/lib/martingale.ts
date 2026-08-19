export const MAX_MARTINGALE_STEPS = 8;
export const MIN_MARTINGALE_STEPS = 2;

export function parseMartingaleRatios(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length < MIN_MARTINGALE_STEPS || input.length > MAX_MARTINGALE_STEPS) return null;
  const ratios = input.map((v) => parseFloat(v));
  if (ratios.some((v) => isNaN(v) || v <= 0)) return null;
  return ratios;
}
