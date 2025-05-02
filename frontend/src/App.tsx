import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import Modal from './components/Modal';
import LatencyChart from './components/LatencyChart';
import { NodeInfo, CachedLatencyData, ModalType, NodeForm, RawLatencyData, FormattedLatencyData } from './types';
// Import optimizeChartData
import { formatChartData, statusColor, optimizeChartData } from './utils/chartUtils';

const API_BASE_URL = '/api';

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
  const [tab, setTab] = useState<'dashboard' | 'Benchmarking' | 'Performance Assurance' | 'Automation' | 'Analytics'>('dashboard');
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
  const [version, setVersion] = useState<string>("v0.1.0");
  // Ref to track nodes currently being preloaded to avoid redundant fetches
  const preloadingNodes = useRef<Set<string>>(new Set());


  // --- Data Fetching ---

  // Fetch Latency (modified to be used for preloading and direct fetching)
  const fetchLatency = useCallback(async (nodeId: string, hours: 2 | 6 | 12 | 24, force = false, isPreload = false) => {
    const cacheKey = `${nodeId}-${hours}`; // Cache based on node and time range
    const cached = latencyCache[cacheKey];
    const now = Date.now();

    // If it's a preload and we are already preloading this specific node/range, skip
    if (isPreload && preloadingNodes.current.has(cacheKey)) {
        return;
    }
    // If not forcing, not preloading, and valid cache exists, use cache
    if (!force && !isPreload && cached && (now - cached.lastUpdated) < 30000) { // 30 sec cache validity
      setChartData(cached.data);
      setIsLoadingChart(false); // Ensure loading is off if using cache
      return;
    }
    // If not preloading, show loading indicator for the selected node
    if (!isPreload && selectedNode?.id === nodeId) {
        setIsLoadingChart(true);
    }
    // Mark as preloading if applicable
    if (isPreload) {
        preloadingNodes.current.add(cacheKey);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/nodes/${nodeId}/latency?hours=${hours}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const rawData: RawLatencyData[] = await res.json();

      if (!Array.isArray(rawData)) throw new Error('Invalid latency data format');

      // 1. Format the data (convert time string to timestamp)
      const formattedData = formatChartData(rawData);

      // 2. Optimize the formatted data (reduce number of points)
      // Let's aim for around 200 points max for better performance
      const optimizedData = optimizeChartData(formattedData, 200);

      // Update cache with OPTIMIZED data
      setLatencyCache(prev => ({
        ...prev,
        [cacheKey]: { data: optimizedData, lastUpdated: now } // Store optimized data
      }));

      // If this fetch was for the currently selected node, update the chart
      if (selectedNode?.id === nodeId && timeRange === hours) {
        setChartData(optimizedData); // Set optimized data
      }

    } catch (error) {
      console.error(`Error fetching latency for ${nodeId} (${hours}h):`, error);
      // Clear chart only if it's the selected node that failed
      if (selectedNode?.id === nodeId && timeRange === hours) {
        setChartData([]);
      }
      // Clear specific cache entry on error? Optional.
      // setLatencyCache(prev => {
      //   const newState = { ...prev };
      //   delete newState[cacheKey];
      //   return newState;
      // });
    } finally {
      // If not preloading, turn off loading indicator for the selected node
      if (!isPreload && selectedNode?.id === nodeId) {
        setIsLoadingChart(false);
      }
      // Remove from preloading set once done
      if (isPreload) {
        preloadingNodes.current.delete(cacheKey);
      }
    }
  }, [latencyCache, selectedNode?.id, timeRange]); // Dependencies for fetchLatency


  // Fetch Nodes (modified to trigger preload)
  const fetchNodes = useCallback(() => {
    fetch(`${API_BASE_URL}/nodes`)
      .then(res => res.ok ? res.json() : Promise.reject(`HTTP error! status: ${res.status}`))
      .then((data: NodeInfo[]) => {
        if (!Array.isArray(data)) throw new Error('Invalid node data format');
        setNodes(data);
        // Trigger preload for all nodes for the current timeRange
        data.forEach(node => {
            // Fetch only if not already cached recently (optional optimization)
            const cacheKey = `${node.id}-${timeRange}`;
            const cached = latencyCache[cacheKey];
            const now = Date.now();
            if (!cached || (now - cached.lastUpdated) >= 30000) { // Preload if cache missing or older than 30s
               fetchLatency(node.id, timeRange, false, true); // isPreload = true
            }
        });
      })
      .catch(error => {
        console.error('Error fetching nodes:', error);
        setNodes([]);
      });
  }, [fetchLatency, timeRange, latencyCache]); // Add fetchLatency, timeRange, latencyCache dependencies

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
      setModalType(null); // Close modal
      fetchNodes(); // Refresh node list
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
  // ... (filteredNodes remains the same) ...
  const filteredNodes = nodes.filter((n) => {
    const byStatus = filter === 'all' || n.status === filter;
    const bySearch = !search || n.id.toLowerCase().includes(search.toLowerCase());
    return byStatus && bySearch;
  });

  // --- Rendering ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex">
      {/* Sidebar */}
      {/* ... (Sidebar JSX remains the same) ... */}
       <aside className="w-64 bg-gray-800 p-6 border-r border-gray-700 flex flex-col">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">vMark</h1>
          <span className="text-sm text-gray-400">{version}</span>
        </div>
        <nav className="space-y-2">
          {(['dashboard', 'Benchmarking', 'Performance Assurance', 'Automation', 'Analytics'] as const).map((t) => (
            <button
              key={t}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300'
              }`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {tab === 'dashboard' && (
          <>
            {/* Header/Filters */}
            {/* ... (Filters/Search/Add Button JSX remains the same) ... */}
             <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
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
                  placeholder="Search nodes by ID..."
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
              {/* ... No nodes messages ... */}
            </div>

            {/* Chart Area */}
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

        {/* Other Tabs */}
        {/* ... (Other Tabs JSX remains the same) ... */}
         {tab === 'Benchmarking' && <div className="text-gray-400">Benchmarking tab content coming soon.</div>}
        {tab === 'Performance Assurance' && <div className="text-gray-400">Performance Assurance tab content coming soon.</div>}
        {tab === 'Automation' && <div className="text-gray-400">Automation tab content coming soon.</div>}
        {tab === 'Analytics' && <div className="text-gray-400">Analytics tab content coming soon.</div>}
      </main>

      {/* Node Management Modal */}
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