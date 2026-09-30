const { Router } = require('express');
const c = require('../controllers/comissoesController');
const { autenticar, exigirEmpresa, exigirPrivilegio } = require('../middleware/auth');

const router = Router();

// POR EMPRESA; privilégio próprio "comissoes" (ver / editar).
router.use(autenticar, exigirEmpresa);

router.get('/funcionarios', exigirPrivilegio('comissoes', 'ver'), c.listarFuncionarios);
router.get('/funcionarios/:id', exigirPrivilegio('comissoes', 'ver'), c.obterFuncionario);
router.put('/funcionarios/:id', exigirPrivilegio('comissoes', 'editar'), c.salvarFuncionario);

module.exports = router;
