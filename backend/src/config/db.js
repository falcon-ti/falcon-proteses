// Pool de conexões com o PostgreSQL (mesmo esquema do falcon-web).
//
// .env: carregado aqui mesmo (e não só em app.js) porque os scripts de
// scripts/ (migrar, criar-admin) usam este arquivo sem passar pelo app.
// ENV_FILE permite um .env por cliente (PM2, ver ecosystem.config.js).
const path = require('path');
require('dotenv').config({ path: process.env.ENV_FILE || path.join(__dirname, '../../.env') });
const { Pool, types } = require('pg');

// FUSO HORÁRIO: o Postgres do servidor costuma rodar em UTC. Toda
// conexão desta aplicação usa o fuso do negócio (padrão Brasília), e o
// processo Node também — assim NOW()/CURRENT_DATE e os "new Date()"
// batem com a hora local de quem usa o sistema.
const FUSO_HORARIO = process.env.APP_TZ || 'America/Sao_Paulo';
if (!/^[A-Za-z0-9_+\-/:<>]+$/.test(FUSO_HORARIO)) {
  throw new Error(`APP_TZ inválido: ${FUSO_HORARIO}`);
}
process.env.TZ = FUSO_HORARIO;

// "date" e "timestamp without time zone" voltam como TEXTO puro
// ("yyyy-mm-dd" / "yyyy-mm-dd hh:mm:ss"), sem virar Date do JS — evita o
// deslocamento de fuso ao serializar em JSON (bug clássico visto no
// falcon-web). Quem formata pra exibição é o frontend (utils/data.js).
types.setTypeParser(types.builtins.DATE, (valor) => valor);
types.setTypeParser(types.builtins.TIMESTAMP, (valor) => valor);

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  options: `-c TimeZone=${FUSO_HORARIO}`,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL', err);
});

module.exports = pool;
