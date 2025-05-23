// Represents the structure of node information fetched from the API
export interface NodeInfo {
  id: string; // Unique identifier for the node (e.g., hostname or UUID)
  node_id?: string; // Optional user-friendly node ID (might be same as id)
  ip: string; // IP address of the node
  port?: number; // Port the node's API is listening on (optional in list view, required for interaction)
  status: 'online' | 'offline'; // Current status
  last_seen: string | null; // ISO 8601 timestamp string or null
  tags?: string[]; // Array of tags associated with the node (renamed from capabilities)
  // Add other properties returned by your /api/nodes endpoint if needed
}

// Structure for latency data points fetched from the API
export interface RawLatencyData {
  time: string; // ISO 8601 timestamp string
  latency_ms: number | null; // Latency in milliseconds, or null if error/timeout
}

// Structure for latency data points after formatting for the chart
export interface FormattedLatencyData {
  time: number; // Unix timestamp (milliseconds)
  latency_ms: number | null; // Latency in milliseconds, or null
}

// Structure for caching latency data
export interface CachedLatencyData {
  [key: string]: { // Key format: `${nodeId}-${hours}`
    data: FormattedLatencyData[];
    lastUpdated: number; // Unix timestamp (milliseconds) of when the cache was updated
  };
}

// Types for the Node Management Modal
export type ModalType = 'add' | null; // Can be expanded if other modal types are needed

// Structure for the form state when adding/editing a node
export interface NodeForm {
  node_id: string;
  ip: string;
  port: string; // Use string for form input, parse to number on submit
  tags: string; // Comma-separated string for form input, parse to array on submit
  auth_token: string; // Auth token for adding a node
}

// Define the option type used by react-select in TwampRunner
export interface NodeOption {
    value: string; // Node ID
    label: string; // Display text (e.g., "node-name (192.168.1.1)")
}

export interface Node {
  id: string;
  node_id?: string;
  ip: string;
  port?: number;
  tags?: string[] | string;
  status: 'online' | 'offline' | 'unknown';
  // --- MODIFIED: Allow null in addition to string and undefined ---
  last_seen?: string | null;
  // --- End Modification ---
  // Add any other properties your Node object has
}

export interface ForwardingRule {
  name: string;
  in_interface: string;
  match_svlan: number | null; // Corregido: nombre y tipo
  match_cvlan: number | null; // Corregido: nombre y tipo
  out_interface: string | null; // Corregido: tipo para coincidir con Optional[str]
  pop_tags: number | null;    // Corregido: tipo
  push_svlan: number | null; // Corregido: tipo
  push_cvlan: number | null; // Corregido: tipo
  active: boolean | null;     // Corregido: tipo
}

export interface ELineService {
  name: string;
  description?: string | null;

  a_node_id: string;
  a_iface: string;
  a_rule_name: string;
  a_node_ip?: string;
  a_rule_data?: ForwardingRule | null; // Usará la ForwardingRule corregida

  z_node_id: string;
  z_iface: string;
  z_rule_name: string;
  z_node_ip?: string;
  z_rule_data?: ForwardingRule | null; // Usará la ForwardingRule corregida

  active: boolean; // El estado general del servicio ya es booleano
  created_at: string;
  updated_at: string;
}

// Payload for creating a new E-Line Service
export interface ELineServiceCreatePayload {
  name: string;
  description?: string | null;
  a_node_id: string;
  a_iface: string;
  a_rule_name: string;
  z_node_id: string;
  z_iface: string;
  z_rule_name: string;
}

// Payload for updating an E-Line Service (all fields optional)
export interface ELineServiceUpdatePayload {
  description?: string | null;
  a_node_id?: string;
  a_iface?: string;
  a_rule_name?: string;
  z_node_id?: string;
  z_iface?: string;
  z_rule_name?: string;
}