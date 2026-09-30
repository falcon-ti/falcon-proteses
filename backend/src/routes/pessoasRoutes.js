const { Router } = require('express');
const pessoasController = require('../controllers/pessoasController');
const { autenticar, exigirEmpresa, exigirPrivilegio } = require('../middleware/auth');

const router = Router();

// Cadastro POR EMPRESA: "exigirEmpresa" coloca a empresa da sessão em
// req.empresaId — o controller filtra/grava sempre por ela.
router.use(autenticar, exigirEmpresa);

router.get('/', exigirPrivilegio('pessoas', 'ver'), pessoasController.listar);
router.get('/:id', exigirPrivilegio('pessoas', 'ver'), pessoasController.obter);
router.post('/', exigirPrivilegio('pessoas', 'incluir'), pessoasController.criar);
router.put('/:id', exigirPrivilegio('pessoas', 'editar'), pessoasController.atualizar);
router.delete('/:id', exigirPrivilegio('pessoas', 'inativar'), pessoasController.excluir);

module.exports = router;
