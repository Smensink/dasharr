import { Router } from 'express';
import { CalendarController } from '../controllers/calendar.controller';

export function createCalendarRoutes(controller: CalendarController): Router {
  const router = Router();

  // Get unified calendar from all services
  router.get('/', controller.getCalendar);

  // Get calendar for a specific service
  router.get('/:service', controller.getServiceCalendar);

  return router;
}
