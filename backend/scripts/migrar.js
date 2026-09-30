// Aplica os scripts de ../../sql (001_..., 002_..., ...) que ainda não
// rodaram nesta base, em ordem de nome. Cada arquivo roda numa transação
// própria e fica registrado em "schema_migracao" — rodar de novo só
// aplica os arquivos novos.
//
// Uso (dentro de backend/):
//   npm run db:migrar
//   ENV_FILE=/etc/falcon-proteses/cliente.env npm run db:migrar
//
// Convenção: arquivo já aplicado NUNCA é editado — mudança de estrutura
// vira um arquivo novo com o próximo número (003_..., 004_...).
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

const PASTA_SQL = path.join(__dirname, '../../sql');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migracao (
        arquivo      varchar(200) PRIMARY KEY,
        aplicado_em  timestamp    NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT arquivo FROM schema_migracao');
    const aplicados = new Set(rows.map((r) => r.arquivo));

    const arquivos = fs
      .readdirSync(PASTA_SQL)
      .filter((nome) => /^\d{3}_.+\.sql$/.test(nome))
      .sort();

    let novos = 0;
    for (const arquivo of arquivos) {
      if (aplicados.has(arquivo)) continue;
      const sql = fs.readFileSync(path.join(PASTA_SQL, arquivo), 'utf8');
      process.stdout.write(`Aplicando ${arquivo}... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migracao (arquivo) VALUES ($1)', [arquivo]);
        await client.query('COMMIT');
        console.log('ok');
        novos += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('ERRO');
        throw err;
      }
    }

    console.log(novos ? `${novos} script(s) aplicado(s).` : 'Base já está atualizada.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
