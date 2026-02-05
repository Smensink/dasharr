export interface TdarrWorkerLimits {
  transcodecpu?: number;
  transcodegpu?: number;
  healthcheckcpu?: number;
  healthcheckgpu?: number;
}

export interface TdarrNodeSummary {
  id: string;
  name: string;
  workerLimits: TdarrWorkerLimits;
  scheduleEnabled?: boolean;
  nodePaused?: boolean;
  priority?: number;
}

export interface TdarrQueueItem {
  id: string;
  title: string;
  file: string;
  status: string;
  workerType?: string;
  nodeId?: string;
  nodeName?: string;
  start?: number;
  currentPlugin?: string;
}

export interface TdarrJobSummary {
  id: string;
  title: string;
  file: string;
  status: string;
  start?: number;
  end?: number;
  duration?: number;
  nodeId?: string;
  nodeName?: string;
  workerGenus?: string;
  type?: string;
  currentPlugin?: string;
  failureStep?: string;
  jobId?: string;
}

export interface TdarrOverview {
  queue: TdarrQueueItem[];
  activeJobs: TdarrQueueItem[];
  successJobs: TdarrJobSummary[];
  failedJobs: TdarrJobSummary[];
  stats: {
    transcodesPerHour: number;
    transcodesLastHour: number;
    windowHours: number;
    totalTranscodes?: number;
    totalHealthChecks?: number;
    queueSize: number;
    activeCount: number;
    successCount: number;
    failureCount: number;
  };
  nodes: TdarrNodeSummary[];
  updatedAt: number;
}
