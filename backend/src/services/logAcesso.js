// Registro de login na tabela "log_acesso". "Best effort": qualquer erro
// aqui só vai pro console, nunca impede o login.
const pool = require('../config/db');

// IP de quem fez a requisição. Atrás de proxy reverso (nginx), o IP real
// vem no primeiro item de "X-Forwarded-For"; sem proxy, é o do socket.
function ipDaRequisicao(req) {
  const encaminhado = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  let ip = encaminhado || req.socket?.remoteAddress || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip.slice(0, 45);
}

async function registrarAcesso(req, idUsuario, idEmpresa) {
  try {
    await pool.query(
      'INSERT INTO log_acesso (usuario, empresa, ip, user_agent) VALUES ($1, $2, $3, $4)',
      [idUsuario, idEmpresa || null, ipDaRequisicao(req), String(req.headers['user-agent'] || '').slice(0, 255)]
    );
  } catch (err) {
    console.error('Falha ao gravar log_acesso:', err);
  }
}

module.exports = { registrarAcesso };
