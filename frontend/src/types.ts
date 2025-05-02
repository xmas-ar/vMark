export interface NodeInfo {
  id: string;
  ip: string;
  port?: number; // Add optional port property
  status: 'online' | 'offline';
  last_seen: string | null;
  tags?: string[] | string | null; // Rename capabilities to tags
  // Add any other properties returned by your /api/nodes endpoint
}

export type CachedLatencyData = {
  [nodeId: string]: {
    data: { time: number; latency: number | null }[]; // Allow null latency
    lastUpdated: number;
  };
};

export type ModalType = 'add' | 'delete' | null;

export type NodeForm = {
  node_id: string;
  ip: string;
  tags: string; // Rename capabilities to tags
  auth_token: string;
  port: string; // Add port field
};

export type RawLatencyData = {
  time: string;
  latency: number | null;
};

export type FormattedLatencyData = {
  time: number;
  latency: number | null;
};