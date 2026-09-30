// Cria (ou redefine a senha de) um usuário ADMINISTRADOR — usado pra dar
// o primeiro acesso numa base nova, antes de existir qualquer empresa.
// Recebe todos os privilégios do catálogo (config/privilegios.js).
//
// Uso (dentro de backend/):
//   npm run db:criar-admin -- ADMIN minhaSenha "Nome Completo"
//
// Depois do primeiro login: cadastrar a empresa em Administração >
// Empresas (quem cadastra já fica vinculado a ela) e os demais usuários.
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');
const { SECOES } = require('../src/config/privilegios');

async function main() {
  const [nomeUsuarioArg, senha, nome] = process.argv.slice(2);
  if (!nomeUsuarioArg || !senha) {
    console.log('Uso: npm run db:criar-admin -- USUARIO SENHA ["Nome completo"]');
    process.exit(1);
  }
  if (senha.length < 6) {
    console.log('A senha precisa ter pelo menos 6 caracteres.');
    process.exit(1);
  }
  const nomeUsuario = nomeUsuarioArg.trim().toUpperCase();
  const hash = await bcrypt.hash(senha, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existente = await client.query(
      `SELECT id FROM usuario WHERE upper(nome_usuario) = $1 AND situacao = 'A'`,
      [nomeUsuario]
    );
    let id;
    if (existente.rows[0]) {
      id = existente.rows[0].id;
      await client.query(
        `UPDATE usuario SET senha = $1, admin = true, user_update = 'SISTEMA', date_update = now() WHERE id = $2`,
        [hash, id]
      );
      console.log(`Usuário ${nomeUsuario} já existia: senha redefinida e marcado como administrador.`);
    } else {
      const { rows } = await client.query(
        `INSERT INTO usuario (nome_usuario, nome, senha, admin, user_insert, user_update)
         VALUES ($1, $2, $3, true, 'SISTEMA', 'SISTEMA') RETURNING id`,
        [nomeUsuario, nome || nomeUsuario, hash]
      );
      id = rows[0].id;
      console.log(`Usuário administrador ${nomeUsuario} criado (id ${id}).`);
    }

    for (const secao of SECOES) {
      for (const tela of secao.telas) {
        for (const acao of [...tela.acoes, ...(tela.especiais || []).map((e) => e.chave)]) {
          await client.query(
            `INSERT INTO usuario_privilegio (usuario, tela, acao, user_insert)
             VALUES ($1, $2, $3, 'SISTEMA') ON CONFLICT DO NOTHING`,
            [id, tela.chave, acao]
          );
        }
      }
    }
    await client.query('COMMIT');
    console.log('Privilégios: todos os do catálogo.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
