import { Request, Response, NextFunction } from 'express';
import { BazarrService } from '../services/bazarr.service';
import { ServiceError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { BazarrSeriesSubtitleSummary, BazarrSubtitleStatus } from '@dasharr/shared-types';

export class BazarrController {
  constructor(private bazarrService: BazarrService) {}

  getMovies = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const radarrIds = this.parseIdList(
        req.method === 'POST'
          ? req.body?.radarrIds ?? req.body?.radarrid ?? req.body?.['radarrid[]']
          : req.query.radarrIds ?? req.query.radarrid ?? req.query['radarrid[]']
      );
      logger.debug(
        `[bazarr] movies request: radarrIds=${radarrIds?.length || 0}`
      );
      const statuses = await this.bazarrService.getMovieSubtitles(radarrIds);
      logger.debug(
        `[bazarr] movies response: statuses=${statuses?.length || 0}`
      );
      res.json(statuses);
    } catch (error) {
      next(new ServiceError('Failed to fetch Bazarr movies', 'bazarr', 500, error));
    }
  };

  getSeriesEpisodes = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const seriesId = Number(req.params.seriesId);
      if (!Number.isFinite(seriesId)) {
        res.status(400).json({ error: 'Invalid series id' });
        return;
      }
      const episodeIds = this.parseIdList(req.query.episodeIds);
      logger.debug(
        `[bazarr] episodes request: seriesId=${seriesId} episodeIds=${episodeIds?.length || 0}`
      );
      const statuses = await this.bazarrService.getEpisodeSubtitles({
        seriesIds: [seriesId],
        episodeIds,
      });
      logger.debug(
        `[bazarr] episodes response: statuses=${statuses?.length || 0}`
      );
      res.json(statuses);
    } catch (error) {
      next(
        new ServiceError('Failed to fetch Bazarr episodes', 'bazarr', 500, error)
      );
    }
  };

  getSeriesSummary = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const seriesIds = this.parseIdList(
        req.method === 'POST'
          ? req.body?.seriesIds ?? req.body?.['seriesIds[]']
          : req.query.seriesIds ?? req.query['seriesIds[]']
      );
      if (!seriesIds || seriesIds.length === 0) {
        res.json([]);
        return;
      }
      logger.debug(
        `[bazarr] summary request: seriesIds=${seriesIds.length}`
      );

      const statuses = await this.bazarrService.getEpisodeSubtitles({
        seriesIds,
      });
      if (!statuses.length) {
        logger.debug(
          `[bazarr] summary request for ${seriesIds?.join(',') || 'none'} returned 0 statuses`
        );
      }
      logger.debug(
        `[bazarr] summary response: statuses=${statuses?.length || 0}`
      );
      const summary = this.buildSeriesSummaries(seriesIds, statuses);
      res.json(summary);
    } catch (error) {
      next(
        new ServiceError(
          'Failed to fetch Bazarr series summary',
          'bazarr',
          500,
          error
        )
      );
    }
  };

  searchMovieSubtitles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const radarrId = Number(req.params.radarrId);
      if (!Number.isFinite(radarrId)) {
        res.status(400).json({ error: 'Invalid movie id' });
        return;
      }
      await this.bazarrService.searchMovieSubtitles(radarrId, req.body || {});
      res.status(202).json({ message: 'Subtitle search started' });
    } catch (error) {
      next(
        new ServiceError('Failed to start movie subtitle search', 'bazarr', 500, error)
      );
    }
  };

  searchEpisodeSubtitles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const seriesId = Number(req.params.seriesId);
      const episodeId = Number(req.params.episodeId);
      if (!Number.isFinite(seriesId) || !Number.isFinite(episodeId)) {
        res.status(400).json({ error: 'Invalid series or episode id' });
        return;
      }
      await this.bazarrService.searchEpisodeSubtitles(
        seriesId,
        episodeId,
        req.body || {}
      );
      res.status(202).json({ message: 'Subtitle search started' });
    } catch (error) {
      next(
        new ServiceError(
          'Failed to start episode subtitle search',
          'bazarr',
          500,
          error
        )
      );
    }
  };

  searchSeriesSubtitles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const seriesId = Number(req.params.seriesId);
      if (!Number.isFinite(seriesId)) {
        res.status(400).json({ error: 'Invalid series id' });
        return;
      }
      await this.bazarrService.searchSeriesSubtitles(seriesId, req.body || {});
      res.status(202).json({ message: 'Subtitle search started' });
    } catch (error) {
      next(
        new ServiceError(
          'Failed to start series subtitle search',
          'bazarr',
          500,
          error
        )
      );
    }
  };

  getLogs = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const logs = await this.bazarrService.getLogs();
      res.json(logs);
    } catch (error) {
      next(new ServiceError('Failed to fetch Bazarr logs', 'bazarr', 500, error));
    }
  };

  getHealth = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.bazarrService.getHealth();
      res.json(health);
    } catch (error) {
      next(new ServiceError('Failed to fetch Bazarr health', 'bazarr', 500, error));
    }
  };

  private parseIdList(value: unknown): number[] | undefined {
    if (!value) {
      return undefined;
    }
    const values = Array.isArray(value) ? value : String(value).split(',');
    const ids = values
      .map((entry) => Number(String(entry).trim()))
      .filter((entry) => Number.isFinite(entry));
    return ids.length > 0 ? ids : undefined;
  }

  private buildSeriesSummaries(
    seriesIds: number[],
    statuses: BazarrSubtitleStatus[]
  ): BazarrSeriesSubtitleSummary[] {
    const builders = new Map<number, SeriesSummaryBuilder>();

    const ensureSummary = (id: number) => {
      if (!builders.has(id)) {
        builders.set(id, {
          seriesId: id,
          total: 0,
          available: 0,
          missing: 0,
          unknown: 0,
          languages: new Set<string>(),
          missingLanguages: new Set<string>(),
        });
      }
      return builders.get(id)!;
    };

    statuses.forEach((status) => {
      if (!status.seriesId) return;
      const summary = ensureSummary(status.seriesId);
      summary.total += 1;
      if (status.status === 'available') {
        summary.available += 1;
      } else if (status.status === 'missing') {
        summary.missing += 1;
      } else {
        summary.unknown += 1;
      }
      status.languages?.forEach((lang) => summary.languages.add(lang));
      status.missingLanguages?.forEach((lang) => summary.missingLanguages.add(lang));
    });

    for (const seriesId of seriesIds) {
      ensureSummary(seriesId);
    }

    return Array.from(builders.values()).map((summary) => ({
      seriesId: summary.seriesId,
      total: summary.total,
      available: summary.available,
      missing: summary.missing,
      unknown: summary.unknown,
      languages: summary.languages.size ? Array.from(summary.languages) : undefined,
      missingLanguages: summary.missingLanguages.size
        ? Array.from(summary.missingLanguages)
        : undefined,
    }));
  }
}

interface SeriesSummaryBuilder {
  seriesId: number;
  total: number;
  available: number;
  missing: number;
  unknown: number;
  languages: Set<string>;
  missingLanguages: Set<string>;
}
