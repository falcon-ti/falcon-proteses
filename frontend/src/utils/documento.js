// Formatação/validação de documentos brasileiros no frontend — mesma
// regra de backend/src/utils/documento.js (o backend confere de novo).
// CNPJ alfanumérico (Receita, desde jul/2026): letras nas 12 primeiras
// posições, 2 dígitos verificadores numéricos.

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

export function limparDocumento(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function cpfValido(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(cpf[i]) * (tamanho + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(cpf[tamanho])) return false;
  }
  return true;
}

export function cnpjValido(valor) {
  const cnpj = limparDocumento(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcularDv = (base) => {
    let peso = 2;
    let soma = 0;
    for (let i = base.length - 1; i >= 0; i -= 1) {
      soma += (base.charCodeAt(i) - 48) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = calcularDv(cnpj.slice(0, 12));
  const dv2 = calcularDv(cnpj.slice(0, 12) + dv1);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

// Exibição: "11222333000181" -> "11.222.333/0001-81"; CPF idem.
export function formatarCnpjCpf(valor) {
  const v = limparDocumento(valor);
  if (v.length === 11) return v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (v.length === 14) return v.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
  return v;
}

export function formatarCep(valor) {
  const v = somenteDigitos(valor);
  return v.length === 8 ? `${v.slice(0, 5)}-${v.slice(5)}` : v;
}

export function formatarTelefone(valor) {
  const v = somenteDigitos(valor);
  if (v.length === 11) return v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (v.length === 10) return v.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return v;
}

// Máscara do q-input de telefone: fixo (10 dígitos) ou celular (11).
// "fill-mask" desligado; o q-input usa "unmasked-value".
export function mascaraTelefone(valor) {
  return somenteDigitos(valor).length > 10 ? '(##) #####-####' : '(##) ####-#####';
}
