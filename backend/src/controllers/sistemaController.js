// Servidor/porta/base que o backend está usando — mostrado no rodapé do
// menu lateral (útil com mais de um ambiente rodando). Nunca usuário/senha.
async function info(req, res) {
  res.json({
    servidor: process.env.PGHOST || null,
    porta: process.env.PGPORT || null,
    banco: process.env.PGDATABASE || null,
  });
}

module.exports = { info };
