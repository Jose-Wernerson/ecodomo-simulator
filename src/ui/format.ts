export const num = (x: number, d = 1) => (Number.isFinite(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
export const hhmm = (h: number) => { const m = Math.floor((h % 1) * 60); return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
export function phaseName(h: number, sunUp: boolean, x: number) {
  if (!sunUp) return 'Noite';
  if (x < 0.07) return 'Amanhecer';
  if (x < 0.42) return 'Manhã';
  if (x < 0.58) return 'Meio-dia';
  if (x < 0.93) return 'Tarde';
  return 'Pôr do sol';
}
