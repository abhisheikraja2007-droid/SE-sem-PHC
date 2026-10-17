const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');

router.get('/', staffController.getAllStaff);
router.get('/roster', staffController.getDutyRoster);
router.post('/roster', staffController.assignShift);
router.patch('/roster/:id', staffController.updateDutyStatus);

module.exports = router;
