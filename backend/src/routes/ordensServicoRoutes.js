const { Router } = require('express');
const c = require('../controllers/ordensServicoController');
const { autenticar, exigirEmpresa, exigirPrivilegio } = require('../middleware/auth');

const router = Router();

// Lançamento POR EMPRESA: tudo com a empresa da sessão (req.empresaId).
router.use(autenticar, exigirEmpresa);

router.get('/', exigirPrivilegio('ordens-servico', 'ver'), c.listar);
router.get('/opcoes', exigirPrivilegio('ordens-servico', 'ver'), c.opcoes);
router.get('/:id', exigirPrivilegio('ordens-servico', 'ver'), c.obter);
router.post('/', exigirPrivilegio('ordens-servico', 'incluir'), c.criar);
router.put('/:id', exigirPrivilegio('ordens-servico', 'editar'), c.atualizar);
router.post('/:id/concluir', exigirPrivilegio('ordens-servico', 'concluir'), c.concluir);
router.post('/:id/reabrir', exigirPrivilegio('ordens-servico', 'reabrir'), c.reabrir);
router.post('/:id/cancelar', exigirPrivilegio('ordens-servico', 'inativar'), c.cancelar);

module.exports = router;
