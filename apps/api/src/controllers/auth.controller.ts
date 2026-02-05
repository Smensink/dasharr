import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { PlexAuthService } from '../services/plex-auth.service';
import { ServiceError, ValidationError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { config } from '../config/services.config';
import { logger } from '../utils/logger';

interface PendingPlexAuth {
  clientId: string;
  pinId: number;
  pinCode: string;
  expiresAt: string;
  createdAt: number;
  lastPendingLogAt?: number;
}

export class AuthController {
  private pendingPlexAuth = new Map<string, PendingPlexAuth>();

  constructor(private plexAuth: PlexAuthService) {}

  startPlexAuth = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { clientId } = _req.body as { clientId?: string };
      if (!clientId) {
        throw new ValidationError('Missing clientId');
      }
      if (!config.auth.url) {
        throw new ValidationError('AUTH_URL is required for Plex login');
      }

      this.cleanupExpiredPlexAuth();
      const pin = await this.plexAuth.createPin(clientId);
      const state = crypto.randomBytes(16).toString('hex');

      this.pendingPlexAuth.set(state, {
        clientId,
        pinId: pin.id,
        pinCode: pin.code,
        expiresAt: pin.expiresAt,
        createdAt: Date.now(),
      });

      const forwardUrl = `${config.auth.url}/auth/plex/callback?state=${encodeURIComponent(
        state
      )}&pinId=${encodeURIComponent(String(pin.id))}`;
      const authUrl = this.plexAuth.buildAuthUrl(clientId, pin.code, forwardUrl);

      res.json({ authUrl, expiresAt: pin.expiresAt, code: pin.code });
    } catch (error) {
      if (error instanceof ValidationError) {
        next(error);
        return;
      }
      next(new ServiceError('Failed to start Plex login', 'auth', 500, error));
    }
  };

  completePlexAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { state, pinId, clientId } = req.body as {
        state?: string;
        pinId?: string | number;
        clientId?: string;
      };
      if (!state || !pinId || !clientId) {
        throw new ValidationError('Missing state, pinId, or clientId');
      }

      this.cleanupExpiredPlexAuth();
      const pending = this.pendingPlexAuth.get(state);
      if (!pending) {
        res.status(410).json({ status: 'expired' });
        return;
      }
      if (String(pending.pinId) !== String(pinId) || pending.clientId !== clientId) {
        throw new ValidationError('Invalid Plex auth state');
      }

      if (Date.now() > new Date(pending.expiresAt).getTime()) {
        this.pendingPlexAuth.delete(state);
        res.status(410).json({ status: 'expired' });
        return;
      }

      const result = await this.plexAuth.exchangePin(
        pending.pinId,
        pending.pinCode,
        pending.clientId
      );

      if (result.status === 'authorized' && result.user) {
        const token = await this.plexAuth.createSessionToken(result.user);
        res.cookie(config.auth.cookieName, token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.auth.cookieSecure,
          maxAge: config.auth.sessionTtlDays * 24 * 60 * 60 * 1000,
          path: '/',
        });
        this.pendingPlexAuth.delete(state);
        res.json({ status: 'authorized', user: result.user });
        return;
      }

      if (this.shouldLogPending(pending)) {
        logger.info(
          `[auth] Plex pin pending: pinId=${pending.pinId}, expiresAt=${pending.expiresAt}`
        );
      }
      res.json({ status: 'pending' });
    } catch (error) {
      if (error instanceof ValidationError) {
        next(error);
        return;
      }
      next(new ServiceError('Failed to verify Plex login', 'auth', 500, error));
    }
  };

  getMe = async (req: Request, res: Response): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    if (!config.auth.enabled) {
      res.json({ authenticated: true, user: null });
      return;
    }
    if (!user) {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, user });
  };

  logout = async (_req: Request, res: Response): Promise<void> => {
    res.clearCookie(config.auth.cookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.auth.cookieSecure,
      path: '/',
    });
    res.json({ success: true });
  };

  private cleanupExpiredPlexAuth(): void {
    const now = Date.now();
    for (const [state, entry] of this.pendingPlexAuth.entries()) {
      const expiresAt = new Date(entry.expiresAt).getTime();
      if (now > expiresAt || now - entry.createdAt > 15 * 60 * 1000) {
        this.pendingPlexAuth.delete(state);
      }
    }
  }

  private shouldLogPending(entry: PendingPlexAuth): boolean {
    const now = Date.now();
    if (!entry.lastPendingLogAt || now - entry.lastPendingLogAt > 30000) {
      entry.lastPendingLogAt = now;
      return true;
    }
    return false;
  }
}
