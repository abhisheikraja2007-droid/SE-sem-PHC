const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

router.get('/kpis', analyticsController.getKpis);
router.get('/trends', analyticsController.getTrends);

module.exports = router;
