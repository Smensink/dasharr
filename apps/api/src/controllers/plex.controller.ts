import { Request, Response, NextFunction } from 'express';
import { PlexService } from '../services/plex.service';
import { ServiceError } from '../middleware/errorHandler';

export class PlexController {
  constructor(private plexService: PlexService) {}

  getSessions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const sessions = await this.plexService.getSessionsTransformed();
      res.json(sessions);
    } catch (error) {
      next(new ServiceError('Failed to fetch Plex sessions', 'plex', 500, error));
    }
  };

  getLibraries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const libraries = await this.plexService.getLibraries();
      res.json(libraries);
    } catch (error) {
      next(new ServiceError('Failed to fetch Plex libraries', 'plex', 500, error));
    }
  };

  getLibraryItems = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const libraryKey = Array.isArray(req.params.libraryKey)
        ? req.params.libraryKey[0]
        : req.params.libraryKey;
      if (!libraryKey) {
        res.status(400).json({ error: 'Library key is required' });
        return;
      }
      const items = await this.plexService.getLibraryItems(libraryKey);
      res.json(items);
    } catch (error) {
      next(new ServiceError('Failed to fetch library items', 'plex', 500, error));
    }
  };

  getMediaByGuid = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const guid = Array.isArray(req.params.guid)
        ? req.params.guid[0]
        : req.params.guid;
      if (!guid) {
        res.status(400).json({ error: 'GUID is required' });
        return;
      }
      const results = await this.plexService.getMediaByGuidWithServer(guid);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to fetch media by GUID', 'plex', 500, error));
    }
  };

  searchMedia = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({ error: 'Query parameter "q" is required' });
        return;
      }
      const results = await this.plexService.searchMediaWithServer(query);
      res.json(results);
    } catch (error) {
      next(new ServiceError('Failed to search Plex media', 'plex', 500, error));
    }
  };

  getServerInfo = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const info = await this.plexService.getServerInfo();
      res.json(info);
    } catch (error) {
      next(new ServiceError('Failed to fetch Plex server info', 'plex', 500, error));
    }
  };

  getHealth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const health = await this.plexService.getHealth();
      res.json(health);
    } catch (error) {
      next(new ServiceError('Failed to fetch Plex health', 'plex', 500, error));
    }
  };

  // Find media using IDs first, then fall back to title search
  findMedia = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { 
        title, 
        type, 
        seriesTitle, 
        seasonNumber, 
        episodeNumber,
        imdbId, 
        tmdbId, 
        tvdbId 
      } = req.query;

      const query = title as string;
      const mediaType = type as 'movie' | 'episode' | undefined;
      
      console.log(`[PlexController] findMedia called: query="${query}", type=${type}, seriesTitle="${seriesTitle}", imdbId=${imdbId}, tmdbId=${tmdbId}, tvdbId=${tvdbId}`);
      
      if (!query) {
        res.status(400).json({ error: 'Query parameter "title" is required' });
        return;
      }

      // Try ID-based search first (more accurate)
      if (imdbId || tmdbId || tvdbId) {
        console.log(`[PlexController] Trying ID-based search...`);
        const byId = await this.plexService.findMediaByIds({
          title: query,
          imdbId: imdbId as string | undefined,
          tmdbId: tmdbId ? parseInt(tmdbId as string, 10) : undefined,
          tvdbId: tvdbId ? parseInt(tvdbId as string, 10) : undefined,
          type: mediaType,
          seasonNumber: seasonNumber ? parseInt(seasonNumber as string, 10) : undefined,
          episodeNumber: episodeNumber ? parseInt(episodeNumber as string, 10) : undefined,
        });
        
        if (byId && byId.length > 0) {
          console.log(`[PlexController] ID-based search found ${byId.length} results, returning first: ${byId[0].title}`);
          res.json(byId);
          return;
        }
        console.log(`[PlexController] ID-based search found no results`);
      }

      // Fall back to title search
      // For episodes, try series title first then filter
      if (mediaType === 'episode' && seriesTitle) {
        console.log(`[PlexController] Trying series search for: ${seriesTitle}`);
        const bySeries = await this.plexService.findEpisodeBySeries(
          seriesTitle as string,
          seasonNumber ? parseInt(seasonNumber as string, 10) : undefined,
          episodeNumber ? parseInt(episodeNumber as string, 10) : undefined
        );
        
        if (bySeries && bySeries.type === 'episode') {
          console.log(`[PlexController] Series search found episode: ${bySeries.title}`);
          res.json([bySeries]);
          return;
        } else if (bySeries) {
          console.log(`[PlexController] Series search returned series (not episode): ${bySeries.title}`);
          // Don't return series for episodes - try direct search instead
        } else {
          console.log(`[PlexController] Series search found no results`);
        }
      }

      // Last resort: direct title search
      console.log(`[PlexController] Falling back to title search: ${query}`);
      const results = await this.plexService.searchMediaWithServer(query);
      console.log(`[PlexController] Title search found ${results.length} results:`, results.map(r => r.title));
      
      // For episodes, try to find an episode result, not a movie or show
      if (mediaType === 'episode') {
        const episodeResult = results.find(r => r.type === 'episode');
        if (episodeResult) {
          console.log(`[PlexController] Found episode in title search: ${episodeResult.title}`);
          res.json([episodeResult]);
          return;
        }
      }
      
      res.json(results);
    } catch (error) {
      console.error('[PlexController] Error in findMedia:', error);
      next(new ServiceError('Failed to find Plex media', 'plex', 500, error));
    }
  };
}
