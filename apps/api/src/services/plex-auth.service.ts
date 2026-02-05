import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { XMLParser } from 'fast-xml-parser';
import { config } from '../config/services.config';
import { PlexClient } from '../clients/PlexClient';
import { logger } from '../utils/logger';

interface PlexPinResponse {
  id: number;
  code: string;
  expiresAt: string;
  authToken?: string;
}

interface PlexUser {
  id: number;
  uuid?: string;
  email?: string;
  username: string;
  title?: string;
  thumb?: string;
}

interface PlexResource {
  clientIdentifier?: string;
  machineIdentifier?: string;
  provides?: string;
  product?: string;
  owned?: boolean;
}

export class PlexAuthService {
  private plexHttp: AxiosInstance;
  private clientId: string;
  private clientName = 'Dasharr';
  private serverIdCache?: { id: string; fetchedAt: number };
  private xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

  constructor() {
    this.clientId = this.loadClientId();
    this.plexHttp = axios.create({
      baseURL: 'https://plex.tv',
      timeout: 15000,
      headers: {
        Accept: 'application/json',
        'X-Plex-Client-Identifier': this.clientId,
        'X-Plex-Product': this.clientName,
        'X-Plex-Version': '1.0.0',
        'X-Plex-Platform': 'Web',
        'X-Plex-Device': 'Dasharr',
      },
    });
  }

  private logPlexError(context: string, error: unknown): void {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const raw = error.response.data;
        const data =
          typeof raw === 'string'
            ? raw.slice(0, 1000)
            : JSON.stringify(raw).slice(0, 1000);
        logger.warn(
          `[auth] Plex ${context} error ${error.response.status} ${error.response.statusText}: ${data}`
        );
        return;
      }
      logger.warn(`[auth] Plex ${context} request failed: ${error.message}`);
      return;
    }
    logger.warn(`[auth] Plex ${context} unexpected error`);
  }

  async createPin(
    clientId: string
  ): Promise<{ id: number; code: string; expiresAt: string }> {
    let response;
    try {
      response = await this.plexHttp.post<PlexPinResponse>(
        'https://plex.tv/api/v2/pins',
        new URLSearchParams({
          strong: 'false',
        }),
        {
          headers: {
            ...this.plexHeaders(clientId),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    } catch (error) {
      this.logPlexError('create pin', error);
      throw error;
    }

    const { id, code, expiresAt } = response.data;
    return { id, code, expiresAt };
  }

  async exchangePin(
    pinId: string | number,
    pinCode: string,
    clientId: string
  ): Promise<{ status: 'pending' | 'authorized'; user?: PlexUser; token?: string }> {
    let response;
    try {
      response = await this.plexHttp.get<PlexPinResponse>(
        `https://plex.tv/api/v2/pins/${pinId}`,
        {
          params: {
            code: pinCode,
          },
          headers: this.plexHeaders(clientId),
        }
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        logger.warn('[auth] Plex rate limited pin check; treating as pending.');
        return { status: 'pending' };
      }
      this.logPlexError('check pin', error);
      throw error;
    }

    const pin = response.data;
    if (!pin?.authToken) {
      return { status: 'pending' };
    }

    const user = await this.getUser(pin.authToken);
    const hasAccess = await this.userHasServerAccess(pin.authToken, clientId);
    if (!hasAccess) {
      throw new Error('Plex user does not have access to this server');
    }

    return { status: 'authorized', user, token: pin.authToken };
  }

  async createSessionToken(user: PlexUser): Promise<string> {
    const secret = new TextEncoder().encode(config.auth.sessionSecret);
    const ttlDays = config.auth.sessionTtlDays || 30;
    return new SignJWT({
      username: user.username,
      title: user.title,
      email: user.email,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(user.id))
      .setIssuedAt()
      .setExpirationTime(`${ttlDays}d`)
      .sign(secret);
  }

  async verifySessionToken(token: string): Promise<PlexUser | null> {
    try {
      const secret = new TextEncoder().encode(config.auth.sessionSecret);
      const payload = await jwtVerify(token, secret);
      return {
        id: Number(payload.payload.sub),
        username: payload.payload.username as string,
        title: payload.payload.title as string | undefined,
        email: payload.payload.email as string | undefined,
      };
    } catch {
      return null;
    }
  }

  buildAuthUrl(clientId: string, code: string, forwardUrl: string): string {
    const base = 'https://app.plex.tv/auth#';
    const params = new URLSearchParams({
      clientID: clientId,
      code,
      forwardUrl,
      'context[device][product]': this.clientName,
      'context[device][platform]': 'Web',
    });
    return `${base}?${params.toString()}`;
  }

  private loadClientId(): string {
    if (config.auth.plexClientId) return config.auth.plexClientId;

    const dataDir = path.join(process.cwd(), 'data');
    const filePath = path.join(dataDir, 'plex-client-id.txt');
    try {
      if (fs.existsSync(filePath)) {
        const stored = fs.readFileSync(filePath, 'utf-8').trim();
        if (stored) return stored;
      }
    } catch {
      // ignore
    }

    const id = `dasharr-${crypto.randomUUID()}`;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(filePath, id, 'utf-8');
    } catch {
      // ignore
    }
    return id;
  }

  private plexHeaders(clientId: string, token?: string): Record<string, string> {
    return {
      Accept: 'application/json',
      'X-Plex-Product': this.clientName,
      'X-Plex-Client-Identifier': clientId,
      'X-Plex-Version': '1.0.0',
      'X-Plex-Platform': 'Web',
      'X-Plex-Device': 'Dasharr',
      ...(token ? { 'X-Plex-Token': token } : {}),
    };
  }

  private async getUser(token: string, clientId?: string): Promise<PlexUser> {
    let response;
    try {
      response = await this.plexHttp.get<PlexUser>('https://plex.tv/api/v2/user', {
        headers: {
          ...this.plexHeaders(clientId || this.clientId, token),
        },
      });
    } catch (error) {
      this.logPlexError('get user', error);
      throw error;
    }
    return response.data;
  }

  private async userHasServerAccess(
    token: string,
    clientId?: string
  ): Promise<boolean> {
    const serverId = await this.getServerIdentifier();
    if (!serverId) {
      logger.warn(
        '[auth] Plex server identifier unavailable; skipping server access enforcement.'
      );
      return true;
    }

    const resources = await this.getResources(token, clientId);
    return resources.some((resource) => {
      const provides = resource.provides || '';
      const identifier = resource.clientIdentifier || resource.machineIdentifier;
      return provides.includes('server') && identifier === serverId;
    });
  }

  private async getServerIdentifier(): Promise<string | null> {
    const cache = this.serverIdCache;
    if (cache && Date.now() - cache.fetchedAt < 10 * 60 * 1000) {
      return cache.id;
    }

    const plexConfig = config.plex;
    if (!plexConfig?.baseUrl || !plexConfig?.apiKey) {
      logger.warn('[auth] Plex not configured; cannot validate access.');
      return null;
    }

    const client = new PlexClient(plexConfig);
    const info = await client.getServerInfo();
    const id = info.machineIdentifier;
    this.serverIdCache = { id, fetchedAt: Date.now() };
    return id;
  }

  private async getResources(token: string, clientId?: string): Promise<PlexResource[]> {
    let response;
    try {
      response = await axios.get('https://plex.tv/api/v2/resources', {
        params: {
          includeHttps: 1,
          includeRelay: 1,
          includeIPv6: 1,
        },
        headers: {
          ...this.plexHeaders(clientId || this.clientId, token),
        },
      });
    } catch (error) {
      this.logPlexError('get resources', error);
      throw error;
    }

    const data = response.data;
    if (typeof data === 'string') {
      return this.parseXmlResources(data);
    }

    if (Array.isArray(data)) return data as PlexResource[];
    if (Array.isArray(data?.resources)) return data.resources as PlexResource[];
    if (Array.isArray(data?.MediaContainer?.Device)) return data.MediaContainer.Device as PlexResource[];
    if (data?.resources?.resource) {
      return Array.isArray(data.resources.resource)
        ? (data.resources.resource as PlexResource[])
        : [data.resources.resource as PlexResource];
    }
    return [];
  }

  private parseXmlResources(xml: string): PlexResource[] {
    try {
      const parsed = this.xmlParser.parse(xml);
      const devices = parsed?.MediaContainer?.Device || parsed?.resources?.resource;
      if (!devices) return [];
      if (Array.isArray(devices)) return devices as PlexResource[];
      return [devices as PlexResource];
    } catch (error) {
      logger.warn('[auth] Failed to parse Plex resources XML');
      return [];
    }
  }
}
