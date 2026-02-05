import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import { logger } from '../../utils/logger';

export interface ClientConfig {
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

export class HttpClient {
  protected axiosInstance: AxiosInstance;
  protected serviceName: string;

  constructor(config: ClientConfig, serviceName: string = 'http') {
    this.serviceName = serviceName;

    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'X-Api-Key': config.apiKey }),
        ...config.headers,
      },
    });

    // Store credentials for qBittorrent or other basic auth services
    if (config.username && config.password) {
      this.axiosInstance.defaults.auth = {
        username: config.username,
        password: config.password,
      };
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug(
          `[${this.serviceName}] ${config.method?.toUpperCase()} ${config.url}`
        );
        return config;
      },
      (error) => {
        logger.error(`[${this.serviceName}] Request error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and retry
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as RetryConfig;

        if (!config) {
          return Promise.reject(error);
        }

        // Don't retry if we've already retried max times
        const maxRetries = 3;
        config.__retryCount = config.__retryCount || 0;

        if (config.__retryCount >= maxRetries) {
          logger.error(
            `[${this.serviceName}] Max retries (${maxRetries}) reached for ${config.url}`
          );
          return Promise.reject(error);
        }

        // Only retry on network errors or 5xx server errors
        const shouldRetry =
          error.code === 'ECONNABORTED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNREFUSED' ||
          error.code === 'ENOTFOUND' ||
          (error.response && error.response.status >= 500);

        if (!shouldRetry) {
          return Promise.reject(error);
        }

        config.__retryCount += 1;

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, config.__retryCount) * 1000;

        logger.warn(
          `[${this.serviceName}] Retrying request (${config.__retryCount}/${maxRetries}) after ${delay}ms: ${config.url}`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        return this.axiosInstance(config);
      }
    );
  }

  async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    try {
      const response = await this.axiosInstance.get<T>(url, { params });
      return response.data;
    } catch (error) {
      this.handleError(error, 'GET', url);
      throw error;
    }
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      // Log POST data for debugging
      logger.info(
        `[${this.serviceName}] POST ${url} payload: ${JSON.stringify(data, null, 2)}`
      );
      const response = await this.axiosInstance.post<T>(url, data, config);
      return response.data;
    } catch (error) {
      this.handleError(error, 'POST', url, data);
      throw error;
    }
  }

  async put<T>(url: string, data?: any): Promise<T> {
    try {
      const response = await this.axiosInstance.put<T>(url, data);
      return response.data;
    } catch (error) {
      this.handleError(error, 'PUT', url, data);
      throw error;
    }
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      logger.info(
        `[${this.serviceName}] PATCH ${url} payload: ${JSON.stringify(data, null, 2)}`
      );
      const response = await this.axiosInstance.patch<T>(url, data, config);
      return response.data;
    } catch (error) {
      this.handleError(error, 'PATCH', url, data);
      throw error;
    }
  }

  async delete<T>(url: string): Promise<T> {
    try {
      const response = await this.axiosInstance.delete<T>(url);
      return response.data;
    } catch (error) {
      this.handleError(error, 'DELETE', url);
      throw error;
    }
  }

  private handleError(error: unknown, method: string, url: string, requestData?: any): void {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      const responseData = error.response?.data;

      logger.error(
        `[${this.serviceName}] ${method} ${url} failed with status ${status}`
      );

      // Log request data for 400 errors
      if (status === 400 && requestData) {
        logger.error(
          `[${this.serviceName}] Request payload: ${JSON.stringify(requestData, null, 2)}`
        );
      }

      // Log full response data for 400 errors to see validation details
      if (status === 400 && responseData) {
        logger.error(
          `[${this.serviceName}] Response error: ${JSON.stringify(responseData, null, 2)}`
        );
      }

      logger.error(
        `[${this.serviceName}] Error message: ${message}`
      );
    } else {
      logger.error(
        `[${this.serviceName}] ${method} ${url} failed: ${error}`
      );
    }
  }
}
