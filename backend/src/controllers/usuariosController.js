// Cadastro de usuários. Rotas protegidas por privilégio "usuarios.*"
// (ver usuariosRoutes.js).
//
// - "login" (usuario.nome_usuario) é gravado em CAIXA ALTA e o login
//   compara sem diferenciar maiúsculas — "Admin" e "ADMIN" seriam
//   ambíguos. Único entre os ATIVOS (índice parcial no banco).
// - "excluir" INATIVA (situacao = 'I'); vínculos com empresas e
//   privilégios ficam guardados caso ele seja reativado.
// - "empresas": ids das empresas que o usuário acessa (usuario_empresa).
// - "privilegios": ["tela.acao", ...] (usuario_privilegio).
// Usuário + empresas + privilégios são gravados numa transação só.
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { SECOES, ACOES_PADRAO, normalizarPrivilegios } = require('../config/privilegios');
const { invalidarPrivilegios } = require('../services/privilegios');
const { invalidarEmpresaSessao } = require('../services/empresaSessao');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_REGEX = /^[A-Z0-9._-]+$/;

const SELECT_BASE = `
  SELECT u.id, u.nome_usuario, u.nome, u.email, u.admin, u.situacao,
         COALESCE(array_agg(ue.empresa ORDER BY ue.empresa) FILTER (WHERE ue.empresa IS NOT NULL), '{}') AS empresas
  FROM usuario u
  LEFT JOIN usuario_empresa ue ON ue.usuario = u.id`;
const GROUP_BY = 'GROUP BY u.id, u.nome_usuario, u.nome, u.email, u.admin, u.situacao';

function paraApi(r) {
  return {
    id: r.id,
    login: r.nome_usuario,
    nome: r.nome,
    email: r.email,
    papel: r.admin ? 'admin' : 'usuario',
    ativo: r.situacao === 'A',
    empresas: r.empresas || [],
  };
}

function normalizarIds(valor) {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

function validarUsuario(body, { senhaObrigatoria }) {
  const erros = [];
  const login = typeof body.login === 'string' ? body.login.trim().toUpperCase() : '';
  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const senha = typeof body.senha === 'string' ? body.senha : '';

  if (!login) erros.push('Informe o usuário (login).');
  else if (login.length > 30) erros.push('O usuário (login) pode ter no máximo 30 caracteres.');
  else if (!LOGIN_REGEX.test(login)) erros.push('O usuário (login) aceita só letras, números, ponto, hífen e sublinhado.');
  if (!nome) erros.push('Informe o nome.');
  else if (nome.length > 120) erros.push('O nome pode ter no máximo 120 caracteres.');
  if (email && !EMAIL_REGEX.test(email)) erros.push('Informe um email válido.');
  if (body.papel && !['admin', 'usuario'].includes(body.papel)) erros.push('Perfil inválido.');
  if (senhaObrigatoria && !senha) erros.push('A senha é obrigatória.');
  if (senha && senha.length < 6) erros.push('A senha deve ter pelo menos 6 caracteres.');
  return erros;
}

async function gravarVinculos(client, idUsuario, empresas, privilegios, loginLogado) {
  await client.query('DELETE FROM usuario_empresa WHERE usuario = $1', [idUsuario]);
  for (const empresa of empresas) {
    await client.query('INSERT INTO usuario_empresa (usuario, empresa, user_insert) VALUES ($1, $2, $3)', [
      idUsuario,
      empresa,
      loginLogado,
    ]);
  }
  await client.query('DELETE FROM usuario_privilegio WHERE usuario = $1', [idUsuario]);
  for (const { tela, acao } of privilegios) {
    await client.query('INSERT INTO usuario_privilegio (usuario, tela, acao, user_insert) VALUES ($1, $2, $3, $4)', [
      idUsuario,
      tela,
      acao,
      loginLogado,
    ]);
  }
}

function tratarErroBanco(err, res, mensagemPadrao) {
  if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário ativo com este login.' });
  if (err.code === '23503') return res.status(400).json({ erro: 'Uma das empresas selecionadas não existe.' });
  console.error(err);
  return res.status(500).json({ erro: mensagemPadrao });
}

// GET /api/usuarios/privilegios/catalogo
function catalogoPrivilegios(req, res) {
  res.json({ acoes: ACOES_PADRAO, secoes: SECOES });
}

// GET /api/usuarios/:id/privilegios -> ["tela.acao", ...]
async function privilegiosDoUsuario(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Usuário inválido.' });
  try {
    const { rows } = await pool.query(
      'SELECT tela, acao FROM usuario_privilegio WHERE usuario = $1 ORDER BY tela, acao',
      [id]
    );
    res.json(rows.map((r) => `${r.tela}.${r.acao}`));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar os privilégios do usuário.' });
  }
}

// GET /api/usuarios
async function listar(req, res) {
  try {
    const { rows } = await pool.query(`${SELECT_BASE} ${GROUP_BY} ORDER BY u.nome_usuario`);
    res.json(rows.map(paraApi));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar usuários.' });
  }
}

// GET /api/usuarios/:id
async function obter(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Usuário inválido.' });
  try {
    const { rows } = await pool.query(`${SELECT_BASE} WHERE u.id = $1 ${GROUP_BY}`, [id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(paraApi(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o usuário.' });
  }
}

// POST /api/usuarios
async function criar(req, res) {
  const body = req.body || {};
  const erros = validarUsuario(body, { senhaObrigatoria: true });
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });

  const empresas = normalizarIds(body.empresas);
  const privilegios = normalizarPrivilegios(body.privilegios);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO usuario (nome_usuario, nome, email, senha, admin, situacao, user_insert, user_update)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
      [
        body.login.trim().toUpperCase(),
        body.nome.trim(),
        body.email?.trim() || null,
        await bcrypt.hash(body.senha, 10),
        body.papel === 'admin',
        body.ativo === false ? 'I' : 'A',
        req.usuario.login,
      ]
    );
    const id = rows[0].id;
    await gravarVinculos(client, id, empresas, privilegios, req.usuario.login);
    await client.query('COMMIT');
    invalidarPrivilegios(id);

    const criado = await pool.query(`${SELECT_BASE} WHERE u.id = $1 ${GROUP_BY}`, [id]);
    res.status(201).json(paraApi(criado.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    tratarErroBanco(err, res, 'Erro ao cadastrar o usuário.');
  } finally {
    client.release();
  }
}

// PUT /api/usuarios/:id — senha em branco = mantém a atual.
async function atualizar(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Usuário inválido.' });
  const body = req.body || {};
  const erros = validarUsuario(body, { senhaObrigatoria: false });
  if (erros.length) return res.status(400).json({ erro: erros.join(' ') });

  const proprioUsuario = id === Number(req.usuario.id);
  const empresas = normalizarIds(body.empresas);
  const privilegios = normalizarPrivilegios(body.privilegios);
  // Trava contra se trancar pra fora: editando a si mesmo, não dá pra se
  // inativar nem tirar "Usuários > Ver/Editar".
  if (proprioUsuario) {
    if (body.ativo === false) return res.status(400).json({ erro: 'Você não pode inativar o seu próprio usuário.' });
    for (const acao of ['ver', 'editar']) {
      if (!privilegios.some((p) => p.tela === 'usuarios' && p.acao === acao)) privilegios.push({ tela: 'usuarios', acao });
    }
  }

  const valores = [
    body.login.trim().toUpperCase(),
    body.nome.trim(),
    body.email?.trim() || null,
    body.papel === 'admin',
    body.ativo === false ? 'I' : 'A',
    req.usuario.login,
  ];
  let clausulaSenha = '';
  if (body.senha) {
    valores.push(await bcrypt.hash(body.senha, 10));
    clausulaSenha = `, senha = $${valores.length}`;
  }
  valores.push(id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE usuario SET nome_usuario = $1, nome = $2, email = $3, admin = $4, situacao = $5,
              user_update = $6, date_update = now()${clausulaSenha}
       WHERE id = $${valores.length}`,
      valores
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    await gravarVinculos(client, id, empresas, privilegios, req.usuario.login);
    await client.query('COMMIT');
    invalidarPrivilegios(id);
    invalidarEmpresaSessao();

    const { rows } = await pool.query(`${SELECT_BASE} WHERE u.id = $1 ${GROUP_BY}`, [id]);
    res.json(paraApi(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    tratarErroBanco(err, res, 'Erro ao atualizar o usuário.');
  } finally {
    client.release();
  }
}

// DELETE /api/usuarios/:id — inativa.
async function excluir(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Usuário inválido.' });
  if (id === Number(req.usuario.id)) {
    return res.status(400).json({ erro: 'Você não pode inativar o seu próprio usuário.' });
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE usuario SET situacao = 'I', user_update = $1, date_update = now() WHERE id = $2`,
      [req.usuario.login, id]
    );
    if (!rowCount) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    invalidarPrivilegios(id);
    invalidarEmpresaSessao();
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao inativar o usuário.' });
  }
}

module.exports = { listar, obter, criar, atualizar, excluir, catalogoPrivilegios, privilegiosDoUsuario };
