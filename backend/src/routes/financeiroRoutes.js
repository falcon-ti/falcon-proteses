const { Router } = require('express');
const c = require('../controllers/financeiroController');
const { autenticar, exigirEmpresa, exigirPrivilegio } = require('../middleware/auth');

const router = Router();

// Financeiro POR EMPRESA (req.empresaId).
router.use(autenticar, exigirEmpresa);

router.get('/contas-receber', exigirPrivilegio('contas-receber', 'ver'), c.listarContas);
router.get('/contas-receber/:id', exigirPrivilegio('contas-receber', 'ver'), c.obterConta);
router.post('/contas-receber/:id/baixar', exigirPrivilegio('contas-receber', 'baixar'), c.baixarConta);
router.post('/contas-receber/baixas/:id/estornar', exigirPrivilegio('contas-receber', 'estornar'), c.estornarBaixa);

router.get('/caixa', exigirPrivilegio('caixa', 'ver'), c.listarCaixa);

module.exports = router;
