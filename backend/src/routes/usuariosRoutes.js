const { Router } = require('express');
const usuariosController = require('../controllers/usuariosController');
const { autenticar, exigirPrivilegio } = require('../middleware/auth');

const router = Router();
router.use(autenticar);

router.get('/', exigirPrivilegio('usuarios', 'ver'), usuariosController.listar);
// Catálogo de telas/ações (monta a aba "Privilégios" do cadastro).
router.get('/privilegios/catalogo', exigirPrivilegio('usuarios', 'ver'), usuariosController.catalogoPrivilegios);
router.get('/:id', exigirPrivilegio('usuarios', 'ver'), usuariosController.obter);
router.get('/:id/privilegios', exigirPrivilegio('usuarios', 'ver'), usuariosController.privilegiosDoUsuario);
router.post('/', exigirPrivilegio('usuarios', 'incluir'), usuariosController.criar);
router.put('/:id', exigirPrivilegio('usuarios', 'editar'), usuariosController.atualizar);
router.delete('/:id', exigirPrivilegio('usuarios', 'inativar'), usuariosController.excluir);

module.exports = router;
