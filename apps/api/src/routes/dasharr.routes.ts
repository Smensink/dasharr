import { Router } from 'express';
import { DasharrController } from '../controllers/dasharr.controller';

export function createDasharrRouter(controller: DasharrController): Router {
  const router = Router();

  router.get('/logs', controller.getLogs);

  return router;
}
