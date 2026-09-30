// Aplicação Express: middlewares globais e rotas. Separar "app" de
// "server" (quem escuta a porta) facilita testes automatizados.
//
// Rotas novas: um arquivo em routes/ montado aqui. Lançamentos/cadastros
// POR EMPRESA usam "autenticar" + "exigirEmpresa" no arquivo de rotas e
// filtram por req.empresaId (ver middleware/auth.js).
require('./config/db'); // carrega o .env (ENV_FILE) e o fuso antes do resto
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const empresasRoutes = require('./routes/empresasRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const localidadesRoutes = require('./routes/localidadesRoutes');
const sistemaRoutes = require('./routes/sistemaRoutes');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// Limite maior que o padrão (100kb) por causa do logo da empresa em base64.
app.use(express.json({ limit: '3mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/localidades', localidadesRoutes);
app.use('/api/sistema', sistemaRoutes);

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// JSON malformado / corpo grande demais — responde em JSON, não em HTML.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Conteúdo grande demais.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno.' });
});

module.exports = app;
