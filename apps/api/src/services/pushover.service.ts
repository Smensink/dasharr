import axios from 'axios';
import { appSettingsService } from './app-settings.service';
import { logger } from '../utils/logger';

const PUSHOVER_API_URL = 'https://api.pushover.net/1/messages.json';

class PushoverService {
  private async send(title: string, message: string, priority?: number): Promise<boolean> {
    const settings = appSettingsService.getPushoverSettings();
    if (!settings.enabled || !settings.apiToken || !settings.userKey) {
      return false;
    }

    try {
      await axios.post(PUSHOVER_API_URL, {
        token: settings.apiToken,
        user: settings.userKey,
        title,
        message,
        priority: priority ?? 0,
      });
      logger.info(`[Pushover] Sent: ${title}`);
      return true;
    } catch (error: any) {
      logger.error(`[Pushover] Failed to send: ${error.message}`);
      return false;
    }
  }

  async notifyMatchFound(gameName: string, count: number): Promise<boolean> {
    const settings = appSettingsService.getPushoverSettings();
    if (!settings.notifyOnMatchFound) return false;
    return this.send(
      'New Match Found',
      `${count} candidate${count > 1 ? 's' : ''} found for ${gameName}. Open Dasharr to review.`
    );
  }

  async notifyDownloadStarted(gameName: string, title: string): Promise<boolean> {
    const settings = appSettingsService.getPushoverSettings();
    if (!settings.notifyOnDownloadStarted) return false;
    return this.send(
      'Download Started',
      `${gameName}\n${title}`
    );
  }

  async notifyDownloadCompleted(gameName: string, title: string): Promise<boolean> {
    const settings = appSettingsService.getPushoverSettings();
    if (!settings.notifyOnDownloadCompleted) return false;
    return this.send(
      'Download Completed',
      `${gameName}\n${title}`,
      -1 // low priority
    );
  }

  async notifyDownloadFailed(gameName: string, title: string, error: string): Promise<boolean> {
    const settings = appSettingsService.getPushoverSettings();
    if (!settings.notifyOnDownloadFailed) return false;
    return this.send(
      'Download Failed',
      `${gameName}\n${title}\nError: ${error}`,
      1 // high priority
    );
  }

  async testNotification(): Promise<{ success: boolean; error?: string }> {
    const settings = appSettingsService.getPushoverSettings();
    if (!settings.apiToken || !settings.userKey) {
      return { success: false, error: 'API token and user key are required' };
    }

    try {
      await axios.post(PUSHOVER_API_URL, {
        token: settings.apiToken,
        user: settings.userKey,
        title: 'Dasharr Test',
        message: 'Pushover notifications are working!',
      });
      return { success: true };
    } catch (error: any) {
      const msg = error.response?.data?.errors?.join(', ') || error.message;
      return { success: false, error: msg };
    }
  }
}

export const pushoverService = new PushoverService();
