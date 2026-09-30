// Validação de documentos brasileiros (CPF, CNPJ, CEP).
//
// CNPJ ALFANUMÉRICO: desde julho/2026 a Receita emite CNPJ com letras nas
// 12 primeiras posições (IN RFB 2.229/2024); os 2 dígitos verificadores
// continuam numéricos. O cálculo é o mesmo módulo 11 de sempre, só que
// cada caractere vale (código ASCII - 48): '0'..'9' = 0..9, 'A' = 17,
// 'B' = 18, ... 'Z' = 42. CNPJs numéricos antigos continuam válidos
// (a regra nova é um superconjunto da antiga).

// Tira máscara: deixa só dígitos (CPF/CEP/telefone).
function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

// Tira máscara do CNPJ/CPF mantendo letras (CNPJ alfanumérico), em
// caixa alta.
function limparDocumento(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function cpfValido(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(cpf[tamanho])) return false;
  }
  return true;
}

function cnpjValido(valor) {
  const cnpj = limparDocumento(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const valorChar = (c) => c.charCodeAt(0) - 48;
  const calcularDv = (base) => {
    let peso = 2;
    let soma = 0;
    for (let i = base.length - 1; i >= 0; i -= 1) {
      soma += valorChar(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = calcularDv(cnpj.slice(0, 12));
  const dv2 = calcularDv(cnpj.slice(0, 12) + dv1);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

// tipoPessoa: 'F' (CPF) ou 'J' (CNPJ).
function documentoValido(tipoPessoa, valor) {
  return tipoPessoa === 'F' ? cpfValido(valor) : cnpjValido(valor);
}

function cepValido(valor) {
  return /^\d{8}$/.test(somenteDigitos(valor));
}

module.exports = { somenteDigitos, limparDocumento, cpfValido, cnpjValido, documentoValido, cepValido };
