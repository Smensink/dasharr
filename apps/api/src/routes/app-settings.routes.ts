import { Router } from 'express';
import { appSettingsController } from '../controllers/app-settings.controller';

export function createAppSettingsRouter(): Router {
  const router = Router();

  // Full settings
  router.get('/', appSettingsController.getSettings);
  router.put('/', appSettingsController.updateSettings);
  router.delete('/', appSettingsController.resetToDefaults);
  router.post('/reset', appSettingsController.resetToDefaults);
  router.get('/defaults', appSettingsController.getDefaults);

  // Games settings
  router.get('/games', appSettingsController.getGamesSettings);
  router.put('/games', appSettingsController.updateGamesSettings);

  // Downloads settings
  router.get('/downloads', appSettingsController.getDownloadsSettings);
  router.put('/downloads', appSettingsController.updateDownloadsSettings);

  // Cache settings
  router.get('/cache', appSettingsController.getCacheSettings);
  router.put('/cache', appSettingsController.updateCacheSettings);

  // System settings
  router.get('/system', appSettingsController.getSystemSettings);
  router.put('/system', appSettingsController.updateSystemSettings);

  // Tdarr settings
  router.get('/tdarr', appSettingsController.getTdarrSettings);
  router.put('/tdarr', appSettingsController.updateTdarrSettings);

  // FlareSolverr settings
  router.get('/flaresolverr', appSettingsController.getFlareSolverrSettings);
  router.put('/flaresolverr', appSettingsController.updateFlareSolverrSettings);

  // Hydra settings
  router.get('/hydra', appSettingsController.getHydraSettings);
  router.put('/hydra', appSettingsController.updateHydraSettings);

  // Pushover settings
  router.get('/pushover', appSettingsController.getPushoverSettings);
  router.put('/pushover', appSettingsController.updatePushoverSettings);
  router.post('/pushover/test', appSettingsController.testPushover);

  return router;
}
