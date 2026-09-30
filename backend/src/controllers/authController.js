// Autenticação.
//
// Login por "nome_usuario" (não é email) + senha (bcrypt). Só usuários
// ativos (situacao = 'A').
//
// EMPRESA DA SESSÃO: os lançamentos do sistema são por empresa, então a
// sessão precisa saber com qual empresa o usuário está trabalhando — ela
// vai dentro do token ({ empresa: { id, nome } }). As opções vêm de
// usuario_empresa (só empresas ativas):
//   0 empresas -> loga sem empresa (empresa = null). Acontece numa base
//                 nova (admin ainda não cadastrou nenhuma) ou com usuário
//                 ainda não vinculado. Rotas com "exigirEmpresa" devolvem
//                 409 até ele escolher/cadastrar uma.
//   1 empresa  -> usa ela direto.
//   2+         -> "empresa" é obrigatório no POST /login (o frontend mostra
//                 o select depois que o campo Usuário perde o foco, via
//                 GET /auth/empresas). Pode trocar depois sem sair do
//                 sistema: POST /auth/trocar-empresa (gera token novo).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { listarPrivilegios } = require('../services/privilegios');
const { empresasDoUsuario } = require('../services/empresaSessao');
const { registrarAcesso } = require('../services/logAcesso');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALIDADE_TOKEN = '8h';

// Monta o payload do token (e o "usuario" devolvido pro frontend).
// "login" (nome_usuario) é o que vai nas colunas de auditoria
// (user_insert/user_update) — ver req.usuario.login nos controllers.
function montarSessao(registro, empresa) {
  return {
    id: registro.id,
    login: registro.nome_usuario,
    nome: registro.nome || registro.nome_usuario,
    email: registro.email || null,
    papel: registro.admin ? 'admin' : 'usuario',
    empresa: empresa ? { id: empresa.id, nome: empresa.nome } : null,
  };
}

async function respostaSessao(sessao) {
  const token = jwt.sign(sessao, process.env.JWT_SECRET, { expiresIn: VALIDADE_TOKEN });
  // Privilégios NÃO vão no token (valem na hora quando alterados) — só
  // seguem junto pro frontend montar menu/rotas/botões.
  const privilegios = await listarPrivilegios(sessao.id);
  return { token, usuario: { ...sessao, privilegios } };
}

// GET /api/auth/empresas?usuario=NOME — pública (o login ainda não
// terminou). Não diferencia "usuário não existe" de "sem empresa": os
// dois devolvem [], pra não dar pista de quais usuários existem.
async function empresasParaLogin(req, res) {
  const usuario = String(req.query.usuario || '').trim();
  if (!usuario) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT id FROM usuario WHERE upper(nome_usuario) = upper($1) AND situacao = 'A'`,
      [usuario]
    );
    if (!rows[0]) return res.json([]);
    const empresas = await empresasDoUsuario(rows[0].id);
    res.json(empresas.map(({ id, nome }) => ({ id, nome })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar empresas.' });
  }
}

// POST /api/auth/login { usuario, senha, empresa? }
async function login(req, res) {
  const { usuario, senha, empresa } = req.body || {};
  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, nome_usuario, nome, email, senha, admin
       FROM usuario WHERE upper(nome_usuario) = upper($1) AND situacao = 'A'`,
      [String(usuario).trim()]
    );
    const registro = rows[0];
    // Mensagem genérica de propósito (não diz se errou usuário ou senha).
    if (!registro || !(await bcrypt.compare(String(senha), registro.senha))) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }

    const empresas = await empresasDoUsuario(registro.id);
    let empresaEscolhida = null;
    if (empresas.length === 1) {
      empresaEscolhida = empresas[0];
    } else if (empresas.length > 1) {
      empresaEscolhida = empresas.find((e) => e.id === Number(empresa));
      if (!empresaEscolhida) {
        return res.status(400).json({ erro: 'Selecione a empresa.' });
      }
    }

    const sessao = montarSessao(registro, empresaEscolhida);
    await registrarAcesso(req, registro.id, empresaEscolhida?.id);
    res.json(await respostaSessao(sessao));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao fazer login.' });
  }
}

// GET /api/auth/me — dados do token + privilégios ATUAIS (do banco).
async function me(req, res) {
  try {
    const { iat, exp, ...sessao } = req.usuario;
    res.json({ ...sessao, privilegios: await listarPrivilegios(Number(sessao.id)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o usuário.' });
  }
}

// GET /api/auth/minhas-empresas — empresas que o usuário logado pode
// escolher (menu "trocar empresa" do cabeçalho).
async function minhasEmpresas(req, res) {
  try {
    res.json(await empresasDoUsuario(Number(req.usuario.id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar empresas.' });
  }
}

// POST /api/auth/trocar-empresa { empresa } — troca a empresa da sessão
// sem sair do sistema: confere o vínculo e devolve um TOKEN NOVO.
async function trocarEmpresa(req, res) {
  const idEmpresa = Number(req.body?.empresa);
  try {
    const { rows } = await pool.query(
      `SELECT id, nome_usuario, nome, email, admin FROM usuario WHERE id = $1 AND situacao = 'A'`,
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(401).json({ erro: 'Usuário inativo. Faça login novamente.' });

    const empresa = (await empresasDoUsuario(rows[0].id)).find((e) => e.id === idEmpresa);
    if (!empresa) {
      return res.status(403).json({ erro: 'Você não tem acesso a esta empresa.' });
    }
    await registrarAcesso(req, rows[0].id, empresa.id);
    res.json(await respostaSessao(montarSessao(rows[0], empresa)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao trocar de empresa.' });
  }
}

// PUT /api/auth/senha { senhaAtual, novaSenha } — troca a PRÓPRIA senha.
async function alterarSenha(req, res) {
  const { senhaAtual, novaSenha } = req.body || {};
  if (!senhaAtual || !novaSenha) {
    return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
  }
  if (String(novaSenha).length < 6) {
    return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }
  try {
    const { rows } = await pool.query('SELECT senha FROM usuario WHERE id = $1', [req.usuario.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!(await bcrypt.compare(String(senhaAtual), rows[0].senha))) {
      return res.status(400).json({ erro: 'A senha atual está incorreta.' });
    }
    await pool.query('UPDATE usuario SET senha = $1, user_update = $2, date_update = now() WHERE id = $3', [
      await bcrypt.hash(String(novaSenha), 10),
      req.usuario.login,
      req.usuario.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao alterar a senha.' });
  }
}

// PUT /api/auth/perfil { nome, email } — o próprio usuário edita nome
// completo e email. Devolve token novo (o nome/email vão no token).
async function atualizarPerfil(req, res) {
  const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';
  const email = typeof req.body?.email === 'string' && req.body.email.trim() ? req.body.email.trim() : null;
  if (!nome) return res.status(400).json({ erro: 'Informe o nome.' });
  if (nome.length > 120) return res.status(400).json({ erro: 'O nome pode ter no máximo 120 caracteres.' });
  if (email && !EMAIL_REGEX.test(email)) return res.status(400).json({ erro: 'Informe um email válido.' });

  try {
    const { rows } = await pool.query(
      `UPDATE usuario SET nome = $1, email = $2, user_update = $3, date_update = now()
       WHERE id = $4 RETURNING id, nome_usuario, nome, email, admin`,
      [nome, email, req.usuario.login, req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(await respostaSessao(montarSessao(rows[0], req.usuario.empresa)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar o perfil.' });
  }
}

module.exports = { empresasParaLogin, login, me, minhasEmpresas, trocarEmpresa, alterarSenha, atualizarPerfil };
