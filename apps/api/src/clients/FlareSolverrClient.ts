import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export interface FlareSolverrConfig {
  baseUrl: string;
  timeout?: number;
}

export interface FlareSolverrResponse {
  solution: {
    url: string;
    status: number;
    headers: Record<string, string>;
    response: string;
    cookies?: { name: string; value: string }[];
  };
  status: string;
  message: string;
}

/**
 * FlareSolverr Client
 * 
 * FlareSolverr is a proxy server to bypass Cloudflare protection.
 * It solves the Cloudflare challenge and returns the cookies/session.
 * 
 * Docker: https://github.com/FlareSolverr/FlareSolverr
 */
export class FlareSolverrClient {
  private axiosInstance: AxiosInstance;
  private baseUrl: string;
  private timeout: number;

  constructor(config: FlareSolverrConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 60000;

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Check if FlareSolverr is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get a webpage through FlareSolverr, bypassing Cloudflare
   */
  async get(
    url: string,
    options?: {
      headers?: Record<string, string>;
      maxTimeout?: number;
    }
  ): Promise<FlareSolverrResponse> {
    logger.info(`[FlareSolverr] Requesting: ${url}`);

    const response = await this.axiosInstance.post<FlareSolverrResponse>(
      '/v1',
      {
        cmd: 'request.get',
        url,
        headers: options?.headers,
        maxTimeout: options?.maxTimeout || this.timeout,
      }
    );

    if (response.data.status !== 'ok') {
      throw new Error(`FlareSolverr error: ${response.data.message}`);
    }

    logger.info(`[FlareSolverr] Successfully retrieved: ${url}`);
    return response.data;
  }

  /**
   * Post to a webpage through FlareSolverr
   */
  async post(
    url: string,
    data: Record<string, any>,
    options?: {
      headers?: Record<string, string>;
      maxTimeout?: number;
    }
  ): Promise<FlareSolverrResponse> {
    logger.info(`[FlareSolverr] POST request to: ${url}`);

    const response = await this.axiosInstance.post<FlareSolverrResponse>(
      '/v1',
      {
        cmd: 'request.post',
        url,
        postData: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        maxTimeout: options?.maxTimeout || this.timeout,
      }
    );

    if (response.data.status !== 'ok') {
      throw new Error(`FlareSolverr error: ${response.data.message}`);
    }

    return response.data;
  }

  /**
   * Get cookies for a session (for reuse)
   */
  async getCookies(url: string): Promise<{ name: string; value: string }[]> {
    const response = await this.get(url);
    return response.solution.cookies || [];
  }
}
