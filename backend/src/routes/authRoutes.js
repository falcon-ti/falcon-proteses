const { Router } = require('express');
const authController = require('../controllers/authController');
const { autenticar } = require('../middleware/auth');

const router = Router();

router.post('/login', authController.login);
// Pública de propósito: o frontend chama ANTES do login terminar, só com o
// usuário digitado (ver LoginPage.vue), pra saber se mostra o select de
// empresa.
router.get('/empresas', authController.empresasParaLogin);
router.get('/me', autenticar, authController.me);
router.get('/minhas-empresas', autenticar, authController.minhasEmpresas);
router.post('/trocar-empresa', autenticar, authController.trocarEmpresa);
router.put('/senha', autenticar, authController.alterarSenha);
router.put('/perfil', autenticar, authController.atualizarPerfil);

module.exports = router;
