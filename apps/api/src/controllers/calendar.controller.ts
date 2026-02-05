import { Request, Response, NextFunction } from 'express';
import { RadarrService } from '../services/radarr.service';
import { SonarrService } from '../services/sonarr.service';
import { ReadarrService } from '../services/readarr.service';
import { ServiceError } from '../middleware/errorHandler';

export interface CalendarControllers {
  radarr?: RadarrService;
  sonarr?: SonarrService;
  readarr?: ReadarrService;
}

export class CalendarController {
  constructor(private services: CalendarControllers) {}

  private getTimeZone(): string {
    return process.env.APP_TIME_ZONE || 'UTC';
  }

  private getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);
    const tzPart = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
    const match = tzPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    return sign * ((hours * 60 + minutes) * 60 * 1000);
  }

  private getZonedDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    return { year, month, day };
  }

  private buildZonedDate(
    year: number,
    month: number,
    day: number,
    hours: number,
    minutes: number,
    seconds: number,
    milliseconds: number,
    timeZone: string
  ): Date {
    const utc = Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds);
    const offset = this.getTimeZoneOffsetMs(new Date(utc), timeZone);
    return new Date(utc - offset);
  }

  private getRangeFromQuery(
    start?: string | string[],
    end?: string | string[]
  ): { start: Date; end: Date } {
    const timeZone = this.getTimeZone();
    const now = new Date();
    const startDateInput = typeof start === 'string' ? new Date(start) : now;
    const endDateInput = typeof end === 'string' ? new Date(end) : now;
    const startParts = this.getZonedDateParts(startDateInput, timeZone);
    const endParts = this.getZonedDateParts(endDateInput, timeZone);

    const rangeStart = this.buildZonedDate(
      startParts.year,
      startParts.month,
      startParts.day,
      0,
      0,
      0,
      0,
      timeZone
    );
    const rangeEnd = this.buildZonedDate(
      endParts.year,
      endParts.month,
      endParts.day,
      23,
      59,
      59,
      999,
      timeZone
    );

    return { start: rangeStart, end: rangeEnd };
  }

  /**
   * Get unified calendar events from all *arr services
   */
  getCalendar = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { start, end } = req.query;
      const { start: normalizedStart, end: normalizedEnd } = this.getRangeFromQuery(
        start as string | undefined,
        end as string | undefined
      );

      const events: any[] = [];

      // Fetch calendar from each enabled service
      if (this.services.radarr) {
        try {
          const radarrCalendar = await this.services.radarr.getCalendar({
            start: normalizedStart,
            end: normalizedEnd,
          });
          // Add service metadata to each event
          const radarrEvents = radarrCalendar.map((event: any) => ({
            ...event,
            service: 'radarr',
            type: 'movie',
          }));
          events.push(...radarrEvents);
        } catch (error) {
          console.error('Radarr calendar fetch failed:', error);
        }
      }

      if (this.services.sonarr) {
        try {
          const sonarrCalendar = await this.services.sonarr.getCalendar({
            start: normalizedStart,
            end: normalizedEnd,
          });

          // Fetch series data for each unique seriesId
          const seriesMap = new Map<number, any>();
          const uniqueSeriesIds = [...new Set(sonarrCalendar.map((ep: any) => ep.seriesId))];

          await Promise.all(
            uniqueSeriesIds.map(async (seriesId) => {
              try {
                const series = await this.services.sonarr!.getSeriesById(seriesId);
                seriesMap.set(seriesId, {
                  title: series.title,
                  images: series.images,
                });
              } catch (error) {
                console.error(`Failed to fetch series ${seriesId}:`, error);
              }
            })
          );

          // Add service metadata and series info to each event
          const sonarrEvents = sonarrCalendar.map((event: any) => ({
            ...event,
            airDate: event.airDateUtc || event.airDate,
            service: 'sonarr',
            type: 'episode',
            series: seriesMap.get(event.seriesId),
          }));
          events.push(...sonarrEvents);
        } catch (error) {
          console.error('Sonarr calendar fetch failed:', error);
        }
      }

      if (this.services.readarr) {
        try {
          const readarrCalendar = await this.services.readarr.getCalendar({
            start: normalizedStart,
            end: normalizedEnd,
          });
          // Add service metadata to each event
          const readarrEvents = readarrCalendar.map((event: any) => ({
            ...event,
            service: 'readarr',
            type: 'book',
          }));
          events.push(...readarrEvents);
        } catch (error) {
          console.error('Readarr calendar fetch failed:', error);
        }
      }

      const filteredEvents = events.filter((event) => {
        const dateStr =
          event.airDateUtc ||
          event.airDate ||
          event.releaseDate ||
          event.digitalRelease;
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return date >= normalizedStart && date <= normalizedEnd;
      });

      // Sort events by date
      filteredEvents.sort((a, b) => {
        const dateA = new Date(
          a.airDateUtc || a.airDate || a.releaseDate || a.digitalRelease
        );
        const dateB = new Date(
          b.airDateUtc || b.airDate || b.releaseDate || b.digitalRelease
        );
        return dateA.getTime() - dateB.getTime();
      });

      res.json(filteredEvents);
    } catch (error) {
      next(
        new ServiceError(
          'Failed to fetch unified calendar',
          'calendar',
          500,
          error
        )
      );
    }
  };

  /**
   * Get calendar events for a specific service
   */
  getServiceCalendar = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const service = req.params.service as string;
      const { start, end } = req.query;
      const { start: normalizedStart, end: normalizedEnd } = this.getRangeFromQuery(
        start as string | undefined,
        end as string | undefined
      );

      let calendar: any[] = [];

      switch (service) {
        case 'radarr':
          if (this.services.radarr) {
            calendar = await this.services.radarr.getCalendar({
              start: normalizedStart,
              end: normalizedEnd,
            });
          }
          break;
        case 'sonarr':
          if (this.services.sonarr) {
            calendar = await this.services.sonarr.getCalendar({
              start: normalizedStart,
              end: normalizedEnd,
            });
          }
          break;
        case 'readarr':
          if (this.services.readarr) {
            calendar = await this.services.readarr.getCalendar({
              start: normalizedStart,
              end: normalizedEnd,
            });
          }
          break;
        default:
          throw new ServiceError(
            `Unknown service: ${service}`,
            'calendar',
            400
          );
      }

      const filteredCalendar = calendar.filter((event) => {
        const dateStr =
          event.airDateUtc ||
          event.airDate ||
          event.releaseDate ||
          event.digitalRelease;
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return date >= normalizedStart && date <= normalizedEnd;
      });

      res.json(filteredCalendar);
    } catch (error) {
      next(error);
    }
  };
}
