import { Router } from 'express';
import { DownloadsController } from '../controllers/downloads.controller';

export function createDownloadsRouter(controller: DownloadsController): Router {
  const router = Router();

  // Unified endpoints
  router.get('/queue', controller.getQueue);
  router.get('/stats', controller.getStats);
  router.get('/today', controller.getTodayDownloads);
  router.post('/dedupe', controller.runArrDedupe);

  // qBittorrent endpoints
  router.get('/qbittorrent/torrents', controller.getQBitTorrents);
  router.post('/qbittorrent/torrents/:hash/pause', controller.pauseQBitTorrent);
  router.post('/qbittorrent/torrents/:hash/resume', controller.resumeQBitTorrent);
  router.post('/qbittorrent/torrents/:hash/recheck', controller.recheckQBitTorrent);
  router.delete('/qbittorrent/torrents/:hash', controller.deleteQBitTorrent);

  // SABnzbd endpoints
  router.post('/sabnzbd/queue/pause', controller.pauseSabnzbdQueue);
  router.post('/sabnzbd/queue/resume', controller.resumeSabnzbdQueue);
  router.post('/sabnzbd/items/:nzoId/pause', controller.pauseSabnzbdItem);
  router.post('/sabnzbd/items/:nzoId/resume', controller.resumeSabnzbdItem);
  router.post('/sabnzbd/items/:nzoId/move', controller.moveSabnzbdItem);
  router.delete('/sabnzbd/items/:nzoId', controller.deleteSabnzbdItem);
  router.get('/sabnzbd/history', controller.getSabnzbdHistory);

  // RDTClient endpoints
  router.post('/rdtclient/torrents/:id/retry', controller.retryRdtTorrent);
  router.put('/rdtclient/torrents/:id', controller.updateRdtTorrent);
  router.delete('/rdtclient/torrents/:id', controller.deleteRdtTorrent);

  return router;
}
