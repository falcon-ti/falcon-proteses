const { Router } = require('express');
const sistemaController = require('../controllers/sistemaController');
const { autenticar } = require('../middleware/auth');

const router = Router();
router.get('/info', autenticar, sistemaController.info);

module.exports = router;
