// Formatação de valores em reais.
const FORMATO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarMoeda(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? FORMATO.format(numero) : '';
}
