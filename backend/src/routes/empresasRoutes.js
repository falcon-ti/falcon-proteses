const { Router } = require('express');
const empresasController = require('../controllers/empresasController');
const { autenticar, exigirPrivilegio, exigirAlgumPrivilegio } = require('../middleware/auth');

const router = Router();
router.use(autenticar);

// A listagem também alimenta a aba "Empresas" do cadastro de Usuários.
router.get('/', exigirAlgumPrivilegio(['empresas.ver', 'usuarios.ver']), empresasController.listar);
router.get('/:id', exigirPrivilegio('empresas', 'ver'), empresasController.obter);
router.get('/:id/logo', exigirPrivilegio('empresas', 'ver'), empresasController.logo);
router.post('/', exigirPrivilegio('empresas', 'incluir'), empresasController.criar);
router.put('/:id', exigirPrivilegio('empresas', 'editar'), empresasController.atualizar);
router.delete('/:id', exigirPrivilegio('empresas', 'inativar'), empresasController.excluir);

module.exports = router;
