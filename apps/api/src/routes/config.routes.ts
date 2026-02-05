import { Router } from 'express';
import { ConfigController } from '../controllers/config.controller';

const router: Router = Router();
const controller = new ConfigController();

// Get all service configurations
router.get('/', controller.getConfig);

// Get specific service configuration
router.get('/:service', controller.getServiceConfig);

// Update specific service configuration
router.put('/:service', controller.updateServiceConfig);

export default router;
