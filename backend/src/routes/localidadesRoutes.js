const { Router } = require('express');
const localidadesController = require('../controllers/localidadesController');
const { autenticar } = require('../middleware/auth');

const router = Router();
router.use(autenticar);

router.get('/ufs', localidadesController.ufs);
router.get('/cidades', localidadesController.cidades);

module.exports = router;
