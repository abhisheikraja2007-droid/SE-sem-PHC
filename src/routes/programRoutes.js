const express = require('express');
const router = express.Router();
const programController = require('../controllers/programController');

router.get('/:category', programController.getProgramData);

module.exports = router;
