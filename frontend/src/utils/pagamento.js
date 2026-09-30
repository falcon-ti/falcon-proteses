// Meios de pagamento (mesma lista do backend: MEIOS_PAGAMENTO).
export const NOMES_MEIO = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
  TRANSFERENCIA: 'Transferência',
  CHEQUE: 'Cheque',
};

export const OPCOES_MEIO = Object.entries(NOMES_MEIO).map(([value, label]) => ({ value, label }));

export function nomeMeio(meio) {
  return NOMES_MEIO[meio] || meio || '—';
}
