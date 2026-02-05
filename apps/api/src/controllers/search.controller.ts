import { Request, Response, NextFunction } from 'express';
import { RadarrService } from '../services/radarr.service';
import { SonarrService } from '../services/sonarr.service';
import { ReadarrService } from '../services/readarr.service';
import { ServiceError } from '../middleware/errorHandler';
import { SearchResult } from '@dasharr/shared-types';

export interface SearchControllers {
  radarr?: RadarrService;
  sonarr?: SonarrService;
  readarr?: ReadarrService;
}

export class SearchController {
  constructor(private services: SearchControllers) {}

  /**
   * Unified search across all *arr services
   */
  searchAll = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = req.query.q as string;

      if (!query || query.trim().length === 0) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const results: SearchResult[] = [];

      // Search in parallel across all enabled services
      const searchPromises = [];

      if (this.services.radarr) {
        searchPromises.push(
          this.services.radarr
            .search(query)
            .then((radarrResults) => {
              // Add service metadata to each result
              return radarrResults.map((result: any) => ({
                ...result,
                service: 'radarr',
                mediaType: 'movie' as const,
                // Map the inLibrary field (Radarr may use different field names)
                // If the result has an id > 0, it's already in the Radarr library
                inLibrary: result.inLibrary || (result.id !== undefined && result.id > 0),
              }));
            })
            .catch((error) => {
              console.error('Radarr search failed:', error);
              return [];
            })
        );
      }

      if (this.services.sonarr) {
        searchPromises.push(
          this.services.sonarr
            .search(query)
            .then((sonarrResults) => {
              return sonarrResults.map((result: any) => ({
                ...result,
                service: 'sonarr',
                mediaType: 'series' as const,
                // Map the inLibrary field (Sonarr may use different field names)
                inLibrary: result.inLibrary || result.id !== undefined && result.id > 0,
              }));
            })
            .catch((error) => {
              console.error('Sonarr search failed:', error);
              return [];
            })
        );
      }

      if (this.services.readarr) {
        searchPromises.push(
          this.services.readarr
            .search(query)
            .then((readarrResults) => {
              return readarrResults.map((result: any) => ({
                ...result,
                service: 'readarr',
                mediaType: 'book' as const,
                // Map the inLibrary field (Readarr may use different field names)
                inLibrary: result.inLibrary || (result.id !== undefined && result.id > 0),
              }));
            })
            .catch((error) => {
              console.error('Readarr search failed:', error);
              return [];
            })
        );
      }

      // Wait for all searches to complete
      const searchResults = await Promise.all(searchPromises);

      // Flatten and combine results
      searchResults.forEach((serviceResults) => {
        results.push(...serviceResults);
      });

      // Sort by title
      results.sort((a, b) => {
        const titleA = a.title?.toLowerCase() || '';
        const titleB = b.title?.toLowerCase() || '';
        return titleA.localeCompare(titleB);
      });

      res.json({
        query,
        totalResults: results.length,
        results,
      });
    } catch (error) {
      next(
        new ServiceError('Failed to perform unified search', 'search', 500, error)
      );
    }
  };

  /**
   * Search in a specific service
   */
  searchService = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const service = req.params.service as string;
      const query = req.query.q as string;

      if (!query || query.trim().length === 0) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      let results: SearchResult[] = [];

      switch (service) {
        case 'radarr':
          if (this.services.radarr) {
            results = await this.services.radarr.search(query);
          }
          break;
        case 'sonarr':
          if (this.services.sonarr) {
            results = await this.services.sonarr.search(query);
          }
          break;
        case 'readarr':
          if (this.services.readarr) {
            results = await this.services.readarr.search(query);
          }
          break;
        default:
          res.status(400).json({ error: `Unknown service: ${service}` });
          return;
      }

      res.json({
        query,
        service,
        totalResults: results.length,
        results,
      });
    } catch (error) {
      next(error);
    }
  };
}
