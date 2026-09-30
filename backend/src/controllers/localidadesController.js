// Lookups de UF e cidades (IBGE) — só leitura, pra qualquer usuário
// logado (selects de endereço em Empresa e, depois, em clientes/dentistas).
const pool = require('../config/db');

// GET /api/localidades/ufs
async function ufs(req, res) {
  try {
    const { rows } = await pool.query('SELECT sigla, nome, codigo_ibge FROM uf ORDER BY sigla');
    res.json(rows.map((r) => ({ sigla: r.sigla, nome: r.nome, codigoIbge: r.codigo_ibge })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar as UFs.' });
  }
}

// GET /api/localidades/cidades?uf=SP — todas as cidades da UF (a maior,
// MG, tem 853 — cabe tranquilo num select com filtro local).
async function cidades(req, res) {
  const uf = String(req.query.uf || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) return res.status(400).json({ erro: 'Informe a UF.' });
  try {
    const { rows } = await pool.query('SELECT codigo_ibge, nome FROM cidade WHERE uf = $1 ORDER BY nome', [uf]);
    res.json(rows.map((r) => ({ codigoIbge: r.codigo_ibge, nome: r.nome })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar as cidades.' });
  }
}

module.exports = { ufs, cidades };
