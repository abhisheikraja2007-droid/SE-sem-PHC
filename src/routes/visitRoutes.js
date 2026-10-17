const express = require('express');
const router = express.Router();
const visitController = require('../controllers/visitController');

router.get('/', visitController.getAllVisits);
router.get('/:id', visitController.getVisitById);
router.post('/', visitController.createVisit);
router.patch('/:id/triage', visitController.updateTriageStatus);
router.post('/:id/consultation', visitController.recordConsultation);

module.exports = router;
