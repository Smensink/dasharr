import { HttpClient } from './base/HttpClient';
import { ServiceConfig } from '../config/services.config';

export interface TdarrCrudRequest {
  collection: string;
  mode: string;
  docID?: string;
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  query?: Record<string, any>;
}

export class TdarrClient extends HttpClient {
  constructor(config: ServiceConfig) {
    super(
      {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        timeout: config.timeout,
      },
      'tdarr'
    );
  }

  async getStatus(): Promise<any> {
    return this.get('/api/v2/status');
  }

  async getNodes(): Promise<any> {
    return this.post('/api/v2/get-nodes', { data: {} });
  }

  async crudDb<T = any>(data: TdarrCrudRequest): Promise<T> {
    return this.post('/api/v2/cruddb', { data });
  }

  async listFootprintReports(footprintId: string): Promise<any> {
    return this.post('/api/v2/list-footprintId-reports', {
      data: { footprintId },
    });
  }

  async readJobFile(args: {
    footprintId: string;
    jobId: string;
    jobFileId: string;
  }): Promise<any> {
    return this.post('/api/v2/read-job-file', { data: args });
  }

  async alterWorkerLimit(args: {
    nodeID: string;
    process: 'increase' | 'decrease';
    workerType: string;
  }): Promise<any> {
    return this.post('/api/v2/alter-worker-limit', { data: args });
  }

  async scanIndividualFile(args: { file: any; scanTypes?: string[] }): Promise<any> {
    return this.post('/api/v2/scan-individual-file', args);
  }
}
