import { Router } from 'express';
import { TdarrController } from '../controllers/tdarr.controller';

export function createTdarrRoutes(controller: TdarrController): Router {
  const router = Router();

  router.get('/overview', controller.getOverview);
  router.post('/workers', controller.updateWorkerLimit);
  router.post('/requeue', controller.requeueFailed);
  router.get('/health', controller.getHealth);

  return router;
}
