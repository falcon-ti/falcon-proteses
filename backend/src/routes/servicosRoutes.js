const { Router } = require('express');
const servicosController = require('../controllers/servicosController');
const { autenticar, exigirEmpresa, exigirPrivilegio } = require('../middleware/auth');

const router = Router();

// Cadastro POR EMPRESA: "exigirEmpresa" coloca a empresa da sessão em
// req.empresaId — o controller filtra/grava sempre por ela.
router.use(autenticar, exigirEmpresa);

router.get('/', exigirPrivilegio('servicos', 'ver'), servicosController.listar);
router.get('/:id', exigirPrivilegio('servicos', 'ver'), servicosController.obter);
router.post('/', exigirPrivilegio('servicos', 'incluir'), servicosController.criar);
router.put('/:id', exigirPrivilegio('servicos', 'editar'), servicosController.atualizar);
router.delete('/:id', exigirPrivilegio('servicos', 'inativar'), servicosController.excluir);

module.exports = router;
