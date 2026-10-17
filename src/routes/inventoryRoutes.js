const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

router.get('/', inventoryController.getAllMedicines);
router.get('/alerts', inventoryController.getAlerts);
router.post('/', inventoryController.addOrRestockMedicine);
router.post('/dispense', inventoryController.dispensePrescription);
router.patch('/:id', inventoryController.updateStock);

module.exports = router;
