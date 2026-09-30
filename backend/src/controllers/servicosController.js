// Cadastro de Serviços (descrição + valor).
//
// POR EMPRESA: rotas com "exigirEmpresa" (servicosRoutes.js); toda consulta
// filtra por req.empresaId. "excluir" INATIVA (situacao = 'I') — os
// serviços vão ser referenciados pelas ordens de serviço.
const pool = require('../config/db');
const { texto } = require('../utils/endereco');

function paraApi(r) {
  return {
    id: r.id,
    descricao: r.descricao,
    valor: Number(r.valor),
    ativo: r.situacao === 'A',
  };
}

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function prepararServico(body) {
  const erros = [];
  const descricao = texto(body.descricao, 150);
  const valor = body.valor === null || body.valor === undefined || body.valor === '' ? NaN : Number(body.valor);
  if (!descricao) erros.push('Informe a descrição.');
  if (!Number.isFinite(valor) || valor < 0) erros.push('Informe um valor válido (zero ou maior).');
  if (valor >= 1e12) erros.push('Valor muito alto.');
  return {
    erros,
    dados: { descricao, valor: Math.round(valor * 100) / 100, situacao: body.ativo === false ? 'I' : 'A' },
  };
}

function tratarErroBanco(err, res, mensagemPadrao) {
  if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um serviço ativo com esta descrição.' });
  console.error(err);
  return res.status(500).json({ erro: mensagemPadrao });
}

// GET /api/servicos?ativo=true|false — todos os serviços da empresa.
async function listar(req, res) {
  let filtroSituacao = '';
  if (req.query.ativo === 'true') filtroSituacao = `AND situacao = 'A'`;
  else if (req.query.ativo === 'false') filtroSituacao = `AND situacao = 'I'`;
  try {
    const { rows } = await pool.query(
      `SELECT id, descricao, valor, situacao FROM servico WHERE empresa = $1 ${filtroSituacao} ORDER BY descricao`,
      [req.empresaId]
    );
    res.json(rows.map(paraApi));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar serviços.' });
  }
}

// GET /api/servicos/:id
async function obter(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Serviço inválido.' });
  try {
    const { rows } = await pool.query(
      'SELECT id, descricao, valor, situacao FROM servico WHERE id = $1 AND empresa = $2',
      [id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Serviço não encontrado.' });
    res.json(paraApi(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o serviço.' });
  }
}

// POST /api/servicos
async function criar(req, res) {
  const { erros, dados } = prepararServico(req.body || {});
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });
  try {
    const { rows } = await pool.query(
      `INSERT INTO servico (empresa, descricao, valor, situacao, user_insert, user_update)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING id, descricao, valor, situacao`,
      [req.empresaId, dados.descricao, dados.valor, dados.situacao, req.usuario.login]
    );
    res.status(201).json(paraApi(rows[0]));
  } catch (err) {
    tratarErroBanco(err, res, 'Erro ao cadastrar o serviço.');
  }
}

// PUT /api/servicos/:id
async function atualizar(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Serviço inválido.' });
  const { erros, dados } = prepararServico(req.body || {});
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });
  try {
    const { rows } = await pool.query(
      `UPDATE servico SET descricao = $1, valor = $2, situacao = $3, user_update = $4, date_update = now()
       WHERE id = $5 AND empresa = $6 RETURNING id, descricao, valor, situacao`,
      [dados.descricao, dados.valor, dados.situacao, req.usuario.login, id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Serviço não encontrado.' });
    res.json(paraApi(rows[0]));
  } catch (err) {
    tratarErroBanco(err, res, 'Erro ao atualizar o serviço.');
  }
}

// DELETE /api/servicos/:id — inativa.
async function excluir(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Serviço inválido.' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE servico SET situacao = 'I', user_update = $1, date_update = now() WHERE id = $2 AND empresa = $3`,
      [req.usuario.login, id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ erro: 'Serviço não encontrado.' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao inativar o serviço.' });
  }
}

module.exports = { listar, obter, criar, atualizar, excluir };
