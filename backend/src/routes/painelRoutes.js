const { Router } = require('express');
const c = require('../controllers/painelController');
const { autenticar, exigirEmpresa, exigirPrivilegio } = require('../middleware/auth');

const router = Router();

// Resumo da empresa da sessão; cada bloco respeita o privilégio da tela de
// origem (ver painelController.js).
router.get('/', autenticar, exigirEmpresa, exigirPrivilegio('dashboard', 'ver'), c.resumo);

module.exports = router;
