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
router.post(['/faqture-errors', '/api/faqture-errors'], reportError);
router.get(['/faqture-errors', '/api/faqture-errors'], getErrors);
router.put(['/faqture-errors/:id/resolve', '/api/faqture-errors/:id/resolve'], resolveError);

// Clientes
router.get(['/faqture-clients', '/api/faqture-clients'], getClients);

// Actualizaciones de credenciales
router.post(['/config-updates', '/api/config-updates'], saveConfigUpdate);
router.get(['/config-updates/pending', '/api/config-updates/pending'], getPendingUpdates);
router.put(['/config-updates/:id/apply', '/api/config-updates/:id/apply'], markUpdateApplied);

// Configuracion de faqture-api
router.get(['/faqture-config', '/api/faqture-config'], getConfig);
router.put(['/faqture-config/pause', '/api/faqture-config/pause'], pauseService);
router.put(['/faqture-config/resume', '/api/faqture-config/resume'], resumeService);

module.exports = router;
