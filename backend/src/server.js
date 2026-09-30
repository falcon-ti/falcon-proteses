const app = require('./app');

const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET não configurado no .env — a API não sobe sem ele.');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`API do Falcon Próteses rodando em http://localhost:${PORT}`);
});
