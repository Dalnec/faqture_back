const express = require('express');
const router = express.Router();
const {
  reportError,
  getErrors,
  resolveError,
  getClients,
  saveConfigUpdate,
  getPendingUpdates,
  markUpdateApplied,
  getConfig,
  pauseService,
  resumeService,
} = require('../controllers/faqtureController');

// Errores
router.post('/api/faqture-errors', reportError);
router.get('/api/faqture-errors', getErrors);
router.put('/api/faqture-errors/:id/resolve', resolveError);

// Clientes
router.get('/api/faqture-clients', getClients);

// Actualizaciones de credenciales
router.post('/api/config-updates', saveConfigUpdate);
router.get('/api/config-updates/pending', getPendingUpdates);
router.put('/api/config-updates/:id/apply', markUpdateApplied);

// Configuracion de faqture-api
router.get('/api/faqture-config', getConfig);
router.put('/api/faqture-config/pause', pauseService);
router.put('/api/faqture-config/resume', resumeService);

module.exports = router;
