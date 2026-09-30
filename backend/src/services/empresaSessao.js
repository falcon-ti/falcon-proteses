// Empresa da sessão — o coração do "multiempresa".
//
// Cada usuário tem acesso a N empresas (tabela usuario_empresa). No login
// ele escolhe uma (ou ela é escolhida sozinha, se for só uma) e essa
// empresa vai DENTRO do token JWT ({ empresa: { id, nome } }). Todo
// lançamento usa essa empresa — nunca uma empresa vinda do corpo da
// requisição.
//
// Como o token vale 8h, o middleware "exigirEmpresa" reconfere (com cache
// curto) se o vínculo continua valendo e se a empresa continua ativa —
// tirar o acesso de alguém ou inativar a empresa corta na hora (em até
// 30s), sem esperar o token expirar.
const pool = require('../config/db');

const TTL_MS = 30 * 1000;
const cache = new Map(); // "usuario:empresa" -> { expira, ok }

// Empresas ativas vinculadas ao usuário, em ordem alfabética.
async function empresasDoUsuario(idUsuario) {
  const { rows } = await pool.query(
    `SELECT e.id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS nome, e.cnpj_cpf
     FROM usuario_empresa ue
     JOIN empresa e ON e.id = ue.empresa
     WHERE ue.usuario = $1 AND e.situacao = 'A'
     ORDER BY 2`,
    [idUsuario]
  );
  return rows.map((r) => ({ id: r.id, nome: r.nome, cnpjCpf: r.cnpj_cpf }));
}

async function usuarioAcessaEmpresa(idUsuario, idEmpresa) {
  const chave = `${idUsuario}:${idEmpresa}`;
  const agora = Date.now();
  const emCache = cache.get(chave);
  if (emCache && emCache.expira > agora) return emCache.ok;

  const { rowCount } = await pool.query(
    `SELECT 1
     FROM usuario_empresa ue
     JOIN empresa e ON e.id = ue.empresa
     JOIN usuario u ON u.id = ue.usuario
     WHERE ue.usuario = $1 AND ue.empresa = $2 AND e.situacao = 'A' AND u.situacao = 'A'`,
    [idUsuario, idEmpresa]
  );
  const ok = rowCount > 0;
  cache.set(chave, { expira: agora + TTL_MS, ok });
  return ok;
}

function invalidarEmpresaSessao() {
  cache.clear();
}

module.exports = { empresasDoUsuario, usuarioAcessaEmpresa, invalidarEmpresaSessao };
