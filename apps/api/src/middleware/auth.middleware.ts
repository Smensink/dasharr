import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { config } from '../config/services.config';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    title?: string;
    email?: string;
  };
}

function getTokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  const cookieName = config.auth.cookieName;
  const cookies = req.cookies || {};
  if (cookies[cookieName]) {
    return String(cookies[cookieName]);
  }
  return null;
}

async function verifyToken(token: string) {
  const secret = new TextEncoder().encode(config.auth.sessionSecret);
  const result = await jwtVerify(token, secret);
  return result.payload as any;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!config.auth.enabled) {
    next();
    return;
  }

  if (req.path === '/health') {
    next();
    return;
  }

  // Check for API key in header
  const apiKey = req.headers['x-api-key'];
  if (apiKey && config.auth.apiKey && apiKey === config.auth.apiKey) {
    (req as AuthenticatedRequest).user = {
      id: 'api-key-user',
      username: 'API Key',
    };
    next();
    return;
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = await verifyToken(token);
    (req as AuthenticatedRequest).user = {
      id: payload.sub as string,
      username: payload.username as string,
      title: payload.title as string | undefined,
      email: payload.email as string | undefined,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!config.auth.enabled) {
    next();
    return;
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = await verifyToken(token);
    (req as AuthenticatedRequest).user = {
      id: payload.sub as string,
      username: payload.username as string,
      title: payload.title as string | undefined,
      email: payload.email as string | undefined,
    };
  } catch {
    // ignore token errors for optional auth
  }

  next();
}
