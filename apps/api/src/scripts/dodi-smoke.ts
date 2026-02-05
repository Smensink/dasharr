import { configService } from '../services/config.service';
import { DODIAgent } from '../services/games/search-agents/DODIAgent';
import { logger } from '../utils/logger';

async function run(): Promise<void> {
  const flareConfig = configService.getServiceConfig('flaresolverr');

  const agent = new DODIAgent(
    flareConfig?.enabled
      ? { flaresolverrUrl: flareConfig.baseUrl }
      : undefined
  );

  const result = await agent.search('cuphead');
  logger.info(`[DODI Smoke] success=${result.success} candidates=${result.candidates.length}`);
  if (!result.success) {
    logger.error(`[DODI Smoke] error=${result.error}`);
  }
}

run().catch(error => {
  logger.error('[DODI Smoke] fatal error:', error);
  process.exitCode = 1;
});
