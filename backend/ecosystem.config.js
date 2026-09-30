// PM2: um processo por cliente, mesmo código-fonte, .env diferente por
// cliente (mesmo esquema do falcon-web). Rodar a partir de
// /var/www/falcon-proteses/backend:
//   pm2 start ecosystem.config.js
//   pm2 save
//
// Cliente novo: acrescentar uma entrada em "apps" (nome, caminho do .env
// com PORT/PGDATABASE próprios) e rodar
//   pm2 start ecosystem.config.js --only falcon-proteses-<cliente>
module.exports = {
  apps: [
    {
      name: 'falcon-proteses-exemplo',
      script: 'src/server.js',
      cwd: '/var/www/falcon-proteses/backend',
      env: { ENV_FILE: '/etc/falcon-proteses/exemplo.env' },
    },
  ],
};
