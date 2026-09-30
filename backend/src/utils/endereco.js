// Normalização + validação de endereço, comum a todos os cadastros que
// têm endereço (pessoa; os próximos também). Campos da API:
//   cep, rua, numero, complemento, bairro, uf, cidade (código IBGE)
const pool = require('../config/db');
const { somenteDigitos, cepValido } = require('./documento');

function texto(valor, tamanhoMax) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  if (!t) return null;
  return tamanhoMax ? t.slice(0, tamanhoMax) : t;
}

// Devolve { erros: [], endereco: {...} } pronto pra gravar.
async function prepararEndereco(body) {
  const erros = [];
  const cep = body.cep ? somenteDigitos(body.cep) || null : null;
  const uf = texto(body.uf)?.toUpperCase() || null;
  const cidade = body.cidade ? Number(body.cidade) : null;

  if (cep && !cepValido(cep)) erros.push('CEP inválido (8 dígitos).');
  if (cidade && !uf) erros.push('Informe a UF da cidade.');
  if (uf) {
    const { rowCount } = await pool.query('SELECT 1 FROM uf WHERE sigla = $1', [uf]);
    if (!rowCount) erros.push('UF inválida.');
  }
  if (cidade && uf) {
    const { rows } = await pool.query('SELECT uf FROM cidade WHERE codigo_ibge = $1', [cidade]);
    if (!rows[0]) erros.push('Cidade não encontrada.');
    else if (rows[0].uf !== uf) erros.push('A cidade informada não pertence à UF selecionada.');
  }

  return {
    erros,
    endereco: {
      cep,
      rua: texto(body.rua, 150),
      numero: texto(body.numero, 20),
      complemento: texto(body.complemento, 80),
      bairro: texto(body.bairro, 80),
      uf,
      cidade,
    },
  };
}

module.exports = { prepararEndereco, texto };
