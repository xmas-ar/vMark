import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import Modal from './components/Modal';
import LatencyChart from './components/LatencyChart';
// Import the new component (assuming you create it)
import TwampRunner from './components/TwampRunner';
import { NodeInfo, CachedLatencyData, ModalType, NodeForm, RawLatencyData, FormattedLatencyData } from './types';
// Import optimizeChartData
import { formatChartData, statusColor, optimizeChartData } from './utils/chartUtils';

const API_BASE_URL = '/api';

// Define Section types
type SectionName =
  | 'Nodes'
  | 'benchmarks'
  | 'performance'
  | 'automation'
  | 'observability'
  | 'userManagement'
  | 'reports'
  | 'settings'
  | 'aiTools';

interface Section {
  id: SectionName;
  name: string;
  icon: string; // Path relative to public folder
  tabs?: string[]; // Sub-tabs for this section
}

// Define the sections
const sections: Section[] = [
  { id: 'Nodes', name: 'Nodes', icon: '/icons/1 dashboard.png', tabs: ['Summary', 'Check node'] }, // Example tab
  { id: 'benchmarks', name: 'Benchmarks', icon: '/icons/2 benchmarks.png', tabs: ['Twamp (RFC5357)','Service Activation Suite', 'PDV Bench', 'Path MTU'] },
  { id: 'performance', name: 'Performance', icon: '/icons/3 performance.png', tabs: ['Precision Time Mesh (IEEE 1588v2)', 'Ethernet OAM (CFM/LFM)', 'PSA - Pathgate Service Assurance (RFC 5880)'] },
  { id: 'automation', name: 'Automation', icon: '/icons/4 automation.png', tabs: ['Ethernet Services Deployment', 'Scheduled Tests', 'Alerts & Thresholds'] },
  { id: 'observability', name: 'Observability', icon: '/icons/5 observability.png', tabs: ['Flow Export', 'Packet Capture', 'Live Stats', 'Interface Health'] },
  { id: 'userManagement', name: 'User Management', icon: '/icons/6 User Management.png', tabs: ['Tenants', 'Auth'] },
  { id: 'reports', name: 'Reports', icon: '/icons/7 reports.png', tabs: ['Generate', 'History'] },
  { id: 'settings', name: 'Settings', icon: '/icons/8 settings.png', tabs: ['System', 'Notifications', 'Integrations'] },
  { id: 'aiTools', name: 'AI Tools', icon: '/icons/9 AI Tools.png', tabs: ['Forecasting', 'Dynamic Baseline Learning'] },
];

// Helper function (can be placed outside the component or inside if preferred)
const pad = (num: number) => num.toString().padStart(2, '0');

const formatLastSeen = (lastSeenIsoString: string | null | undefined, timezone: 'local' | 'utc'): string => {
  if (!lastSeenIsoString) {
    return 'Never';
  }
  try {
    // Ensure the string is treated as UTC when creating the Date object
    const dt = new Date(lastSeenIsoString + 'Z');
    if (isNaN(dt.getTime())) { // Check for invalid date
        return 'Invalid Date';
    }

    let year, month, day, hours, minutes, seconds;

    if (timezone === 'local') {
      year = dt.getFullYear();
      month = pad(dt.getMonth() + 1);
      day = pad(dt.getDate());
      hours = pad(dt.getHours());
      minutes = pad(dt.getMinutes());
      seconds = pad(dt.getSeconds());
    } else { // timezone === 'utc'
      year = dt.getUTCFullYear();
      month = pad(dt.getUTCMonth() + 1);
      day = pad(dt.getUTCDate());
      hours = pad(dt.getUTCHours());
      minutes = pad(dt.getUTCMinutes());
      seconds = pad(dt.getUTCSeconds());
    }

    const timeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    return timezone === 'utc' ? `${timeString} UTC` : timeString;

  } catch (e) {
      console.error("Error formatting last seen date:", lastSeenIsoString, e);
      return 'Error';
  }
};

// Define a type for the PUT request payload
type NodeUpdatePayload = {
  ip: string;
  port: number;
  tags: string[]; // Rename capabilities to tags
  auth_token?: string; // Optional auth token
};

export default function App() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [timezone, setTimezone] = useState<'local' | 'utc'>('local');
  // Rename 'tab' to 'activeSectionId' and use SectionName type
  const [activeSectionId, setActiveSectionId] = useState<SectionName>('Nodes');
  // Add state for the active sub-tab within the current section
  const [activeSubTab, setActiveSubTab] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [chartData, setChartData] = useState<FormattedLatencyData[]>([]);
  const [latencyCache, setLatencyCache] = useState<CachedLatencyData>({});
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [timeRange, setTimeRange] = useState<2 | 6 | 12 | 24>(2);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [modalMode, setModalMode] = useState<'add' | 'delete' | 'edit'>('add'); // Add 'edit'
  const [nodeForm, setNodeForm] = useState<NodeForm>({
    node_id: '', ip: '', tags: '', auth_token: '', port: '1050' // Rename capabilities to tags
  });
  const [version, setVersion] = useState<string>("v0.1.4");
  const [isSidebarLocked, setIsSidebarLocked] = useState(false); // <-- Add this state
  // Ref to track nodes currently being preloaded to avoid redundant fetches
  const preloadingNodes = useRef<Set<string>>(new Set());

  // Effect to reset sub-tab when main section changes
  useEffect(() => {
    const currentSection = sections.find(s => s.id === activeSectionId);
    // Set the default sub-tab to the first one in the list, or null if no tabs
    setActiveSubTab(currentSection?.tabs?.[0] ?? null);
  }, [activeSectionId]);

  // --- Data Fetching ---

  // Fetch Latency (modified to be used for preloading and direct fetching)
  const fetchLatency = useCallback(async (nodeId: string, hours: 2 | 6 | 12 | 24, force = false, isPreload = false) => {
    const cacheKey = `${nodeId}-${hours}`;
    const cached = latencyCache[cacheKey];
    const now = Date.now();

    if (isPreload && preloadingNodes.current.has(cacheKey)) {
        return;
    }
    if (!force && !isPreload && cached && (now - cached.lastUpdated) < 30000) {
      setChartData(cached.data);
      setIsLoadingChart(false);
      return;
    }

    if (!isPreload && selectedNode?.id === nodeId && timeRange === hours) { // Check timeRange too
        setIsLoadingChart(true);
    }
    if (isPreload) {
        preloadingNodes.current.add(cacheKey);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/nodes/${nodeId}/latency?hours=${hours}&interval=minute`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Error fetching aggregated latency for ${nodeId} (${hours}h):`, res.status, errorText);
        throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
      }
      const rawData: RawLatencyData[] = await res.json();

      if (!Array.isArray(rawData)) {
        console.error('Invalid latency data format received:', rawData);
        throw new Error('Invalid latency data format');
      }

      const formattedData = formatChartData(rawData);

      // Determine maxPoints for optimization based on the 'hours' (timeRange)
      let maxPointsForOptimization: number;
      switch (hours) {
        case 2:
          maxPointsForOptimization = 120; // More detail for 2h view (e.g., 2 points per minute if data is available)
          break;
        case 6:
          maxPointsForOptimization = 120; // (e.g., 1 point every 2 minutes)
          break;
        case 12:
          maxPointsForOptimization = 72; // (e.g., 1 point every 6 minutes)
          break;
        case 24:
          maxPointsForOptimization = 144; // (e.g., 1 point every 12 minutes)
          break;
        default:
          maxPointsForOptimization = 100; // Fallback
      }

      const finalChartData = optimizeChartData(formattedData, maxPointsForOptimization);

      setLatencyCache(prev => ({
        ...prev,
        [cacheKey]: { data: finalChartData, lastUpdated: now }
      }));

      if (!isPreload && selectedNode?.id === nodeId && timeRange === hours) {
        setChartData(finalChartData);
      }

    } catch (error) {
      console.error(`Failed to fetch latency for ${nodeId} (${hours}h):`, error);
      if (!isPreload && selectedNode?.id === nodeId && timeRange === hours) {
        setChartData([]);
      }
    } finally {
      if (!isPreload && selectedNode?.id === nodeId && timeRange === hours) {
        setIsLoadingChart(false);
      }
      if (isPreload) {
        preloadingNodes.current.delete(cacheKey);
      }
    }
  }, [latencyCache, selectedNode?.id, timeRange]); // Ensure all dependencies are listed. `timeRange` was missing for selectedNode condition.

  // Helper function to introduce a delay
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Fetch Nodes (modified to stagger preload)
  const fetchNodes = useCallback(async () => { // Make the callback async
    try {
      const res = await fetch(`${API_BASE_URL}/nodes`); // Use await
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`); // Throw error on bad response

      const data: NodeInfo[] = await res.json(); // Use await
      if (!Array.isArray(data)) throw new Error('Invalid node data format');

      setNodes(data);

      // Staggered preload for all nodes for the current timeRange
      for (const node of data) { // Use for...of loop with await
          const cacheKey = `${node.id}-${timeRange}`;
          const cached = latencyCache[cacheKey];
          const now = Date.now();
          if (!cached || (now - cached.lastUpdated) >= 30000) { // Preload if cache missing or older than 30s
             // Don't await fetchLatency itself, let them run in background, but wait before starting the next one
             fetchLatency(node.id, timeRange, false, true); // isPreload = true
             await sleep(100); // Wait 100ms before starting the next preload fetch
          }
      }
    } catch (error) {
      console.error('Error fetching nodes:', error);
      setNodes([]); // Clear nodes on error
    }
  }, [fetchLatency, timeRange, latencyCache]); // Keep dependencies

  const fetchVersion = useCallback(() => {
    // ... (fetchVersion remains the same) ...
    fetch(`${API_BASE_URL}/version`)
      .then(res => res.ok ? res.json() : Promise.reject(`HTTP error! status: ${res.status}`))
      .then(data => { if (data?.version) setVersion(data.version); })
      .catch(error => console.error('Error fetching version:', error));
  }, []);

  // NEW: Function to fetch only status and last_seen updates
  const fetchNodeStatuses = useCallback(() => {
    fetch(`${API_BASE_URL}/nodes`)
      .then(res => res.ok ? res.json() : Promise.reject(`Silent fetch error: ${res.status}`)) // Don't show alert for background poll
      .then((data: NodeInfo[]) => {
        if (!Array.isArray(data)) {
            console.warn('Invalid node status data format received');
            return; // Ignore invalid data
        }
        // Create a map for quick lookup of updates
        const updateMap = new Map<string, { status: 'online' | 'offline', last_seen: string | null, tags?: string[] }>(); // Rename capabilities to tags
        data.forEach(n => {
          // Normalize tags (previously capabilities)
          const normalizedTags = Array.isArray(n.tags)
            ? n.tags
            : n.tags
            ? [n.tags]
            : undefined;
          updateMap.set(n.id, { status: n.status, last_seen: n.last_seen, tags: normalizedTags }); // Rename capabilities to tags
        });

        setNodes(prevNodes => {
            let hasChanged = false;
            // Map over previous nodes, updating only if necessary
            const newNodes = prevNodes.map(node => {
                const update = updateMap.get(node.id);
                // Check if update exists and if status, last_seen, OR tags changed
                // Ensure update.tags is treated as string[] | undefined (handle null from API)
                const currentTags = update?.tags ?? undefined; // Rename capabilities to tags
                // Simple array comparison (JSON.stringify) is sufficient here for shallow check
                const tagsChanged = JSON.stringify(node.tags) !== JSON.stringify(currentTags); // Rename capabilities to tags
                if (update && (node.status !== update.status || node.last_seen !== update.last_seen || tagsChanged)) { // Rename capabilitiesChanged to tagsChanged
                    hasChanged = true;
                    // Return a new object with all updated fields
                    return {
                        ...node,
                        status: update.status,
                        last_seen: update.last_seen,
                        // Assign the potentially corrected tags value
                        tags: currentTags // Rename capabilities to tags
                    };
                }
                return node; // Return the original node object reference if no change
            });

            // Only trigger a state update if any node actually changed
            return hasChanged ? newNodes : prevNodes;
        });
      })
      .catch(error => {
        // Silently log background poll errors, don't alert the user
        console.warn('Error fetching node statuses:', error);
      });
  }, []); // No dependencies needed as it only calls API and updates state


  // --- Effects ---

  useEffect(() => { // Initial fetches and *full* node polling (less frequent)
    fetchNodes(); // Initial full fetch
    fetchVersion();
    const nodeInterval = setInterval(fetchNodes, 30000); // Full refresh every 30s
    return () => clearInterval(nodeInterval);
  }, [fetchNodes, fetchVersion]);

  // NEW: Effect for frequent status polling
  useEffect(() => {
    const statusInterval = setInterval(fetchNodeStatuses, 2000); // Poll statuses every 2 seconds
    return () => clearInterval(statusInterval); // Cleanup interval on unmount
  }, [fetchNodeStatuses]); // Add fetchNodeStatuses as dependency

  // Effect to update chart when selectedNode or timeRange changes (primarily uses cache now)
  useEffect(() => {
    if (selectedNode) {
      const cacheKey = `${selectedNode.id}-${timeRange}`;
      const cached = latencyCache[cacheKey];
      if (cached) {
        setChartData(cached.data); // Use cached data immediately
        setIsLoadingChart(false);
        // Optionally, trigger a background refresh if cache is old
        const now = Date.now();
        if ((now - cached.lastUpdated) >= 30000) {
            fetchLatency(selectedNode.id, timeRange, false, true); // Background refresh (isPreload=true to hide spinner)
        }
      } else {
        // If not cached (e.g., app just loaded), fetch it directly
        setIsLoadingChart(true); // Show loader while fetching for the first time
        fetchLatency(selectedNode.id, timeRange, false, false); // Not a preload, show spinner
      }
    } else {
      setChartData([]); // Clear chart if no node selected
      setIsLoadingChart(false);
    }
  }, [selectedNode, timeRange, latencyCache, fetchLatency]); // Add fetchLatency


  // --- Handlers ---

  const handleNodeClick = (node: NodeInfo) => {
    if (selectedNode?.id === node.id) {
      setSelectedNode(null);
    } else {
      setSelectedNode(node);
      // Chart update is handled by the useEffect above
    }
  };

  const handleTimeRangeChange = (hours: 2 | 6 | 12 | 24) => {
    if (timeRange !== hours) {
        setTimeRange(hours);
        // Preload data for the new time range for all nodes
        nodes.forEach(node => {
            fetchLatency(node.id, hours, false, true); // isPreload = true
        });
        // Chart update for selected node is handled by the useEffect above
    }
  };

  const handleRefreshChart = () => {
      if (selectedNode) {
          // Force fetch for the selected node and current time range
          fetchLatency(selectedNode.id, timeRange, true, false); // force=true, isPreload=false (show spinner)
      }
  };

  // ... (handleAddNode, handleDeleteNode remain the same) ...
  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: nodeForm.node_id,
          ip: nodeForm.ip,
          port: parseInt(nodeForm.port, 10), // Ensure port is number
          tags: nodeForm.tags.split(',').map(s => s.trim()).filter(Boolean), // Rename capabilities to tags
          auth_token: nodeForm.auth_token,
        }),
      });
      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ detail: 'Failed to add node' }));
         throw new Error(errorData.detail || 'Failed to add node');
      }
      setNodeForm({ node_id: '', ip: '', tags: '', auth_token: '', port: '1050' }); // Reset form, rename capabilities to tags
      setModalType(null); // Close modal immediately
      // fetchNodes(); // Remove this immediate refresh call
    } catch (error: any) {
      console.error('Error adding node:', error);
      alert(`Failed to add node: ${error.message}`);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!window.confirm(`Are you sure you want to delete node "${nodeId}"?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete node');
      fetchNodes();
      if (selectedNode?.id === nodeId) setSelectedNode(null);
      // Keep modal open in delete mode
    } catch (error) {
      console.error('Error deleting node:', error);
      alert('Failed to delete node.');
    }
  };

  const handleManageClick = (e: React.MouseEvent, node: NodeInfo) => {
    e.stopPropagation(); // Prevent the card's main click handler
    setNodeForm({
      node_id: node.id,
      ip: node.ip,
      // Use node.port if available, otherwise default. Ensure it's a string for the form state.
      port: node.port?.toString() || '1050',
      // Join tags array back into a comma-separated string for the form
      tags: Array.isArray(node.tags) ? node.tags.join(', ') : (node.tags || ''), // Rename capabilities to tags
      auth_token: '', // Clear token field for editing - user must re-enter if changing
    });
    setModalMode('edit');
    setModalType('add'); // Reuse the 'add' modal structure
  };

  const handleEditNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeForm.node_id || !nodeForm.ip || !nodeForm.port) {
        alert('Node ID, IP Address, and Port are required.');
        return;
    }
    try {
      // Prepare data using the specific payload type
      const payload: NodeUpdatePayload = {
        ip: nodeForm.ip,
        port: parseInt(nodeForm.port, 10), // Correctly typed as number
        tags: nodeForm.tags.split(',').map(s => s.trim()).filter(Boolean), // Rename capabilities to tags
      };
      // Conditionally add auth_token if provided
      if (nodeForm.auth_token) {
        payload.auth_token = nodeForm.auth_token;
      }

      const response = await fetch(`${API_BASE_URL}/nodes/${nodeForm.node_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), // Send the correctly typed payload
      });

      // ... rest of handleEditNode ...
      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ detail: `Failed to update node ${nodeForm.node_id}` }));
         throw new Error(errorData.detail || `Failed to update node ${nodeForm.node_id}`);
      }

      setNodeForm({ node_id: '', ip: '', tags: '', auth_token: '', port: '1050' }); // Rename capabilities to tags
      setModalType(null);
      fetchNodes();
      // ... potential re-selection logic ...

    } catch (error: any) {
      console.error('Error updating node:', error);
      alert(`Failed to update node: ${error.message}`);
    }
  };

  // --- Filtering ---
  const filteredNodes = nodes.filter((n) => {
    const byStatus = filter === 'all' || n.status === filter;

    // Enhanced search logic
    const searchTerm = search.toLowerCase();
    const bySearch = !search || // If search is empty, show all
                     n.id.toLowerCase().includes(searchTerm) || // Check node ID
                     // Check if any tag in the array includes the search term
                     (Array.isArray(n.tags) && n.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

    return byStatus && bySearch;
  });

  // --- Rendering ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex">
      {/* Sidebar */}
       <aside className={`group transition-all duration-200 ease-in-out bg-gray-800 p-4 border-r border-gray-700 flex flex-col overflow-hidden ${isSidebarLocked ? 'w-64' : 'w-20 hover:w-64'}`}>
        {/* Adjust vMark visibility */}
        <div className="mb-8 flex items-center gap-2">
           {/* Apply the same visibility logic as section names */}
           <span className={`text-xl font-bold text-gray-100 transition-opacity duration-150 delay-100 whitespace-nowrap ${isSidebarLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>vMark</span>
        </div>
        <nav className="space-y-3 flex-1">
          {sections.map((section) => (
            <button
              key={section.id}
              title={section.name} // Tooltip for icon-only state
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeSectionId === section.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300'
              }`}
              onClick={() => setActiveSectionId(section.id)}
            >
              <img src={section.icon} alt="" className="w-6 h-6 flex-shrink-0" /> {/* Icon */}
              <span className={`transition-opacity duration-150 delay-100 whitespace-nowrap ${isSidebarLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{section.name}</span>
            </button>
          ))}
        </nav>

        {/* --- Footer --- */}
        <footer className={`mt-auto pt-4 border-t border-gray-700 transition-opacity duration-150 delay-100 ${isSidebarLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className="flex justify-between items-center mb-2">
            <a
              href="https://github.com/xmas-ar/vMark/blob/main/docs/base/release_notes.md"
              target="_blank"
              rel="noopener noreferrer"
              title="View Release Notes"
              className="text-xs text-gray-400 hover:text-blue-400 hover:underline" // Add hover effect
            >
              {version} {/* Display 'v' prefix */}
            </a>
            {/* Style the lock button */}
            <button
              onClick={() => setIsSidebarLocked(!isSidebarLocked)}
              title={isSidebarLocked ? "Unlock Sidebar" : "Lock Sidebar Open"}
              // Add styling for blue square button
              className="flex items-center justify-center w-7 h-7 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              {/* Adjust icon size if needed */}
              {isSidebarLocked ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              )}
            </button>
          </div>
          <div className="flex justify-center items-center space-x-4">
             {/* Assuming logos are in public/icons/ */}
             <a href="https://pathgate.nl" target="_blank" rel="noopener noreferrer" title="Website">
               <img src="/icons/pathgate.nl.png" alt="Website" className="w-6 h-6 opacity-100 hover:opacity-100" />
             </a>
             <a href="https://linkedin.com/company/pathgate" target="_blank" rel="noopener noreferrer" title="LinkedIn">
               <img src="/icons/linkedin.png" alt="LinkedIn" className="w-4 h-4 opacity-100 hover:opacity-100" />
             </a>
               <a href="https://github.com/xmas-ar/vMark" target="_blank" rel="noopener noreferrer" title="GitHub">
               <img src="/icons/github.png" alt="GitHub" className="w-5 h-5 opacity-100 hover:opacity-100" />
             </a>
          </div>
        </footer>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {/* Find the current section object */}
        {(() => {
          const currentSection = sections.find(s => s.id === activeSectionId);
          if (!currentSection) return <div className="text-red-500">Error: Section not found</div>;

          return (
            <>
              {/* Section Title */}
              <h2 className="text-2xl font-semibold mb-4 text-gray-100">{currentSection.name}</h2>

              {/* Top Tabs (if section has tabs) */}
              {currentSection.tabs && currentSection.tabs.length > 0 && (
                <div className="mb-6 border-b border-gray-700">
                  <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    {currentSection.tabs.map((tabName) => (
                      <button
                        key={tabName}
                        onClick={() => setActiveSubTab(tabName)}
                        className={`${
                          activeSubTab === tabName
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                        } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
                      >
                        {tabName}
                      </button>
                    ))}
                  </nav>
                </div>
              )}

              {/* Content Area based on Section and Sub-Tab */}
              <div>
                {/* --- Nodes Content --- */}
                {activeSectionId === 'Nodes' && activeSubTab === 'Summary' && (
                  <>
                    {/* Header/Filters */}
                     <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                      {/* ... existing filter/search/add button JSX ... */}
                       <div className="flex items-center gap-4 flex-wrap"> {/* Allow wrapping */}
                         <label htmlFor="filter" className="text-sm text-gray-300">Filter:</label>
                         <select
                           id="filter"
                           value={filter}
                           onChange={(e) => setFilter(e.target.value)}
                           className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm text-white"
                         >
                           <option value="all">All</option>
                           <option value="online">Online</option>
                           <option value="offline">Offline</option>
                         </select>
                         <button
                           className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded border border-gray-600"
                           onClick={() => setTimezone((prev) => (prev === 'local' ? 'utc' : 'local'))}
                         >
                           TZ: {timezone.toUpperCase()}
                         </button>
                       </div>
                       <div className="flex items-center gap-2">
                         <input
                           type="text"
                           placeholder="Search nodes by ID or tags..."
                           className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm w-full md:w-64 text-white"
                           value={search}
                           onChange={(e) => setSearch(e.target.value)}
                         />
                         <button
                           onClick={() => { setModalType('add'); setModalMode('add'); }} // Ensure mode is set
                           className="bg-blue-500 hover:bg-blue-400 text-white py-1 px-3 rounded text-sm whitespace-nowrap" // Prevent wrap
                         >
                           Node Add/Del
                         </button>
                       </div>
                     </div>


                    {/* Node Cards */}
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {/* ... existing filteredNodes.map(...) JSX ... */}
                       {filteredNodes.map((node) => (
                         <div
                           key={node.id}
                           // Apply ring directly here when selected
                           className={`relative p-5 bg-gray-800 rounded-lg shadow-md border group transition-all duration-150 ease-in-out hover:border-blue-400 ${
                             selectedNode?.id === node.id ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-700'
                           }`}
                           onClick={(e) => {
                               if (!(e.target instanceof Element && e.target.closest('.manage-button'))) {
                                   handleNodeClick(node);
                               }
                           }}
                         >
                           {/* Card Content - Remove the conditional styling div */}
                           <div>
                             <div className="flex justify-between items-center mb-2">
                               <h2 className="text-lg font-semibold truncate">{node.id}</h2>
                               <span className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColor(node.status)}`} title={node.status} />
                             </div>
                             <p className="text-sm text-gray-400 mb-1 truncate"><strong>IP:</strong> {node.ip}</p>
                             {/* Display Port if available */}
                             <p className="text-sm text-gray-400 mb-1 truncate"><strong>Port:</strong> {node.port || 'N/A'}</p>
                             <p className="text-sm text-gray-400 mb-1 truncate">
                               {/* Change Caps to Tags */}
                               <strong>Tags:</strong> {Array.isArray(node.tags) && node.tags.length > 0 ? node.tags.join(', ') : 'N/A'} {/* Rename capabilities to tags */}
                             </p>
                             <p className="text-xs text-gray-500">
                               <strong>Last Seen:</strong>{' '}
                               {formatLastSeen(node.last_seen, timezone)}
                             </p>
                           </div>

                           {/* Manage Button */}
                           {/* ... button JSX ... */}
                            <button
                             className="manage-button absolute bottom-2 right-2 px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 text-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-in-out"
                             onClick={(e) => handleManageClick(e, node)}
                           >
                             Manage
                           </button>
                         </div>
                       ))}
                    </div>

                    {/* Chart Area */}
                    {/* ... existing selectedNode && (...) JSX for chart ... */}
                     {selectedNode && (
                       <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md border border-gray-700">
                         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                           <h3 className="text-xl font-bold whitespace-nowrap">
                             Heartbeat: {selectedNode.id}
                           </h3>
                           {/* Time Range and Refresh Buttons */}
                           <div className="flex items-center gap-2 flex-wrap">
                             <div className="flex rounded-md border border-gray-600 bg-gray-700 overflow-hidden">
                               {[2, 6, 12, 24].map((hours) => (
                                 <button
                                   key={hours}
                                   onClick={() => handleTimeRangeChange(hours as 2 | 6 | 12 | 24)}
                                   className={`px-3 py-1 text-xs sm:text-sm border-l border-gray-600 first:border-l-0 transition-colors ${
                                     timeRange === hours
                                       ? 'bg-blue-500 text-white'
                                       : 'hover:bg-gray-600 text-gray-300'
                                   }`}
                                 >
                                   {hours}h
                                 </button>
                               ))}
                             </div>
                             <button
                               onClick={handleRefreshChart} // Use dedicated handler
                               disabled={isLoadingChart}
                               className="bg-blue-500 hover:bg-blue-400 text-white py-1 px-3 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                             >
                               {isLoadingChart ? '...' : 'Refresh'}
                             </button>
                           </div>
                         </div>
                         {/* Chart Component */}
                         <div className="h-[300px] w-full">
                            <ErrorBoundary fallback={<div className="text-red-400 p-4 border border-red-400 rounded">Error rendering chart.</div>}>
                              {isLoadingChart ? ( // Simplified loading check
                                <div className="flex items-center justify-center h-full">
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                                </div>
                              ) : chartData.length === 0 ? ( // Check for empty data *after* loading is false
                                 <div className="flex items-center justify-center h-full">
                                    <p className="text-gray-400">No latency data available for this node in the selected range.</p>
                                 </div>
                              ) : (
                                <LatencyChart
                                  chartData={chartData} // Pass optimized data
                                  timeRange={timeRange}
                                  timezone={timezone}
                                  nodeId={selectedNode.id}
                                />
                              )}
                            </ErrorBoundary>
                         </div>
                       </div>
                     )}
                      {!selectedNode && nodes.length > 0 && ( // Show message if nodes exist but none selected
                         <div className="mt-8 flex items-center justify-center h-[300px] text-gray-500">
                             Select a node card above to view its latency details.
                         </div>
                      )}
                  </>
                )}

                {/* --- Benchmarks Content --- */}
                {activeSectionId === 'benchmarks' && (
                  <div>
                    {/* Render the Twamp Runner component */}
                    {activeSubTab === 'Twamp (RFC5357)' && (
                       <TwampRunner nodes={nodes} apiBaseUrl={API_BASE_URL} /> // <-- Replace placeholder
                    )}
                    {/* Keep other benchmark tabs */}
                    {activeSubTab === 'Service Activation Suite' && <div className="text-gray-400">Service Activation Suite Content...</div>}
                    {activeSubTab === 'PDV Bench' && <div className="text-gray-400">PDV Bench Content...</div>}
                    {activeSubTab === 'Path MTU' && <div className="text-gray-400">Path MTU Discovery Content...</div>}
                  </div>
                )}

                {/* --- Performance Content --- */}
                {activeSectionId === 'performance' && (
                   <div>
                     {activeSubTab === 'Service Assurance' && <div className="text-gray-400">24/7 Service Assurance Content...</div>}
                     {activeSubTab === 'Ethernet OAM' && <div className="text-gray-400">Ethernet OAM CFM/LFM Content...</div>}
                   </div>
                )}

                 {/* --- Automation Content --- */}
                 {activeSectionId === 'automation' && (
                    <div>
                      {activeSubTab === 'Deployment' && <div className="text-gray-400">Remote Deployment Content...</div>}
                      {activeSubTab === 'Scheduled Tests' && <div className="text-gray-400">Scheduled Tests Content...</div>}
                      {activeSubTab === 'Alerts' && <div className="text-gray-400">Threshold-Based Alerts Content...</div>}
                    </div>
                 )}

                 {/* --- Observability Content --- */}
                 {activeSectionId === 'observability' && (
                    <div>
                      {activeSubTab === 'Flow Export' && <div className="text-gray-400">Flow Export/Analysis Content...</div>}
                      {activeSubTab === 'Packet Capture' && <div className="text-gray-400">Packet Capture Content...</div>}
                      {activeSubTab === 'Live Stats' && <div className="text-gray-400">Live Traffic Statistics Content...</div>}
                      {activeSubTab === 'Interface Health' && <div className="text-gray-400">Interface Health Monitoring Content...</div>}
                    </div>
                 )}

                 {/* --- User Management Content --- */}
                 {activeSectionId === 'userManagement' && (
                    <div>
                      {activeSubTab === 'Tenants' && <div className="text-gray-400">Multi-Tenant Support Content...</div>}
                      {activeSubTab === 'Auth' && <div className="text-gray-400">Authentication/Authorization Content...</div>}
                    </div>
                 )}

                 {/* --- Reports Content --- */}
                 {activeSectionId === 'reports' && (
                    <div>
                      {activeSubTab === 'Generate' && <div className="text-gray-400">Generate Reports Content...</div>}
                      {activeSubTab === 'History' && <div className="text-gray-400">View Historical Results Content...</div>}
                    </div>
                 )}

                 {/* --- Settings Content --- */}
                 {activeSectionId === 'settings' && (
                    <div>
                      {activeSubTab === 'System' && <div className="text-gray-400">System Configuration Content...</div>}
                      {activeSubTab === 'Notifications' && <div className="text-gray-400">Notification Preferences Content...</div>}
                      {activeSubTab === 'Integrations' && <div className="text-gray-400">Integration Settings Content...</div>}
                    </div>
                 )}

                 {/* --- AI Tools Content --- */}
                 {activeSectionId === 'aiTools' && (
                    <div>
                      {activeSubTab === 'Trend Analysis' && <div className="text-gray-400">Trend Analysis/Forecasting Content...</div>}
                      {activeSubTab === 'Baseline Learning' && <div className="text-gray-400">Dynamic Baseline Learning Content...</div>}
                    </div>
                 )}

              </div>
            </>
          );
        })()}
      </main>

      {/* Node Management Modal */}
      {/* ... existing Modal JSX ... */}
       <Modal
        isOpen={modalType === 'add'} // Keep using 'add' type to trigger opening
        onClose={() => setModalType(null)}
        // Dynamic title based on mode
        title={modalMode === 'edit' ? `Edit Node: ${nodeForm.node_id}` : 'Node Management'}
      >
        {/* Add/Delete/Edit Toggle - Conditionally render */}
        {modalMode !== 'edit' && ( // Only show if NOT in edit mode
          <div className="flex rounded-lg border border-gray-600 bg-gray-700 mb-4 overflow-hidden">
            <button onClick={() => setModalMode('add')} className={`flex-1 px-4 py-2 text-sm transition-colors ${ modalMode === 'add' ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-600' }`}>Add</button>
            <button onClick={() => setModalMode('delete')} className={`flex-1 px-4 py-2 text-sm transition-colors border-l border-gray-600 ${ modalMode === 'delete' ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-600' }`}>Delete</button>
          </div>
        )}

        {/* Add/Edit Form */}
        {(modalMode === 'add' || modalMode === 'edit') && ( // Show form for add or edit
          // Use different onSubmit based on mode
          <form onSubmit={modalMode === 'edit' ? handleEditNode : handleAddNode} className="space-y-3">
             <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Node ID</label>
                <input
                    type="text"
                    value={nodeForm.node_id}
                    onChange={(e) => setNodeForm(prev => ({ ...prev, node_id: e.target.value }))}
                    // Make read-only when editing
                    readOnly={modalMode === 'edit'}
                    className={`mt-1 block w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white ${modalMode === 'edit' ? 'cursor-not-allowed bg-gray-600' : ''}`}
                    required
                />
             </div>
             <div><label className="block text-sm font-medium text-gray-300 mb-1">IP Address</label><input type="text" value={nodeForm.ip} onChange={(e) => setNodeForm(prev => ({ ...prev, ip: e.target.value }))} className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white" required /></div>
             <div><label className="block text-sm font-medium text-gray-300 mb-1">Port</label><input type="number" value={nodeForm.port} onChange={(e) => setNodeForm(prev => ({ ...prev, port: e.target.value }))} className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white" required min="1" max="65535"/></div>
             {/* Rename Capabilities to Tags */}
             <div><label className="block text-sm font-medium text-gray-300 mb-1">Tags <span className="text-gray-500">(optional, comma-separated)</span></label><input type="text" value={nodeForm.tags} onChange={(e) => setNodeForm(prev => ({ ...prev, tags: e.target.value }))} className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white" /></div> {/* Rename capabilities to tags */}
             {/* Conditionally render Auth Token only for 'add' mode */}
             {modalMode === 'add' && (
               <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Auth Token</label>
                  <input
                      type="password"
                      value={nodeForm.auth_token}
                      onChange={(e) => {
                        console.log("Auth Token Input:", e.target.value); // Keep log for debugging if needed
                        setNodeForm(prev => ({ ...prev, auth_token: e.target.value }))
                      }}
                      placeholder=""
                      className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                      required={modalMode === 'add'} // Only required when adding
                      autoComplete="current-password" // Add autocomplete attribute
                  />
               </div>
             )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
              {/* Dynamic button text */}
              <button type="submit" className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-400 rounded text-white">
                {modalMode === 'edit' ? 'Update Node' : 'Add Node'}
              </button>
            </div>
          </form>
        )}

        {/* Delete List */}
        {modalMode === 'delete' && (
          // ... Delete list JSX remains the same ...
          <div className="space-y-3">
            {nodes.length === 0 ? (
              <p className="text-gray-400 text-center">No nodes to delete.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {nodes.map(node => (
                  <div key={node.id} className="flex items-center justify-between p-3 bg-gray-700 rounded hover:bg-gray-600/50 transition-colors">
                    <div>
                      <p className="font-medium text-white">{node.id}</p>
                      <p className="text-sm text-gray-400">{node.ip}</p>
                    </div>
                    <button onClick={() => handleDeleteNode(node.id)} className="px-3 py-1 text-sm text-red-500 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors">Delete</button>
                  </div>
                ))}
              </div>
            )}
             <div className="flex justify-end pt-2">
               <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 text-sm text-gray-300 hover:text-white">Close</button>
             </div>
          </div>
        )}
      </Modal>

    </div>
  );
}