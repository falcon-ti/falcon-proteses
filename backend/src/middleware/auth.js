// Middlewares de autenticação e autorização.
//
//   autenticar            -> exige token válido; preenche req.usuario
//   exigirPrivilegio      -> exige "tela.acao" (usuario_privilegio)
//   exigirAlgumPrivilegio -> exige qualquer um de uma lista
//   exigirEmpresa         -> exige empresa na sessão; preenche req.empresaId
//
// LANÇAMENTOS POR EMPRESA: toda rota de cadastro/lançamento que pertence a
// uma empresa usa "exigirEmpresa" e filtra/grava com req.empresaId:
//
//   router.use(autenticar, exigirEmpresa);
//   router.get('/', exigirPrivilegio('ordens-servico'), controller.listar);
//   ...
//   // no controller:
//   pool.query('SELECT ... FROM ordem_servico WHERE empresa = $1', [req.empresaId]);
//
// Nunca ler "empresa" de req.body/req.query nessas rotas.
const jwt = require('jsonwebtoken');
const { carregarPrivilegios } = require('../services/privilegios');
const { usuarioAcessaEmpresa } = require('../services/empresaSessao');

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Não autenticado. Faça login novamente.' });
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
}

async function carregar(req) {
  if (!req.privilegios) {
    req.privilegios = await carregarPrivilegios(Number(req.usuario.id));
  }
  return req.privilegios;
}

function exigirPrivilegio(tela, acao = 'ver') {
  return exigirAlgumPrivilegio([`${tela}.${acao}`]);
}

function exigirAlgumPrivilegio(chaves) {
  return async (req, res, next) => {
    try {
      const privilegios = await carregar(req);
      if (chaves.some((chave) => privilegios.has(chave))) return next();
      return res.status(403).json({ erro: 'Você não tem privilégio para esta ação.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao verificar privilégios.' });
    }
  };
}

// Precisa vir depois de "autenticar". 409 (e não 403) quando a sessão
// não tem empresa: o frontend usa esse código pra pedir que o usuário
// escolha/cadastre uma empresa.
async function exigirEmpresa(req, res, next) {
  const idEmpresa = Number(req.usuario?.empresa?.id);
  if (!idEmpresa) {
    return res.status(409).json({ erro: 'Nenhuma empresa selecionada na sessão. Selecione uma empresa.' });
  }
  try {
    if (!(await usuarioAcessaEmpresa(Number(req.usuario.id), idEmpresa))) {
      return res.status(401).json({ erro: 'Seu acesso a esta empresa foi removido. Faça login novamente.' });
    }
    req.empresaId = idEmpresa;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao verificar a empresa da sessão.' });
  }
}

module.exports = { autenticar, exigirPrivilegio, exigirAlgumPrivilegio, exigirEmpresa };
