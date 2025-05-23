import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Select, { StylesConfig, Theme, SingleValue } from 'react-select';
// TODO: Ensure 'Node' type is exported from '../types'. Example: export interface Node { ... }
import { Node } from '../types'; // Assuming Node type is defined here
// TODO: Install react-spinners: npm install react-spinners (or yarn add react-spinners)
import { ClipLoader } from 'react-spinners'; // Import spinner

// Define NodeOption type locally or import if moved
interface NodeOption {
  value: string;
  label: string;
}

interface TwampRunnerProps {
  nodes: Node[];
  apiBaseUrl: string;
}

// Helper function for delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to format results (implementation based on desired output)
const formatTwampResults = (results: Record<string, any>): string => {
  // ... implementation details ...
  // Example: return JSON.stringify(results, null, 2); // Basic formatting for now
  if (!results) return "No results data.";

  const dp = (val: number | null | undefined, prec: number = 2): string => {
      if (val === null || val === undefined || !isFinite(val)) return "N/A";
      const valMs = val / 1000.0; // Assuming input is microseconds
      return `${valMs.toFixed(prec)}ms`;
  };

  const loss = results.total_loss_percent !== null && results.total_loss_percent !== undefined
      ? `${results.total_loss_percent.toFixed(1)}%`
      : "N/A";

  const pkts = (results.packets_rx !== null && results.packets_rx !== undefined && results.packets_tx !== null && results.packets_tx !== undefined)
      ? `${results.packets_rx}/${results.packets_tx}`
      : "N/A";
  const totalPkts = results.packets_tx !== null && results.packets_tx !== undefined ? ` Total:${results.packets_tx}` : '';


  // Basic table structure (adjust formatting as needed)
  return `
Sender output:
Direction    Min      Max       Avg      Jitter    Loss     Pkts
-----------------------------------------------------------------------
Outbound:    ${dp(results.outbound_min_us)}   ${dp(results.outbound_max_us)}   ${dp(results.outbound_avg_us)}   ${dp(results.outbound_jitter_us)}     N/A     N/A
Inbound:     ${dp(results.inbound_min_us)}   ${dp(results.inbound_max_us)}   ${dp(results.inbound_avg_us)}   ${dp(results.inbound_jitter_us)}     N/A     ${pkts}
Roundtrip:   ${dp(results.roundtrip_min_us)}   ${dp(results.roundtrip_max_us)}   ${dp(results.roundtrip_avg_us)}   ${dp(results.roundtrip_jitter_us)}     ${loss}   ${totalPkts}
-----------------------------------------------------------------------
${results.error ? `Error: ${results.error}\n` : ''}
`;

};


type IpVersion = 'ipv4' | 'ipv6';

// --- Styles and Theme (keep as is) ---
const selectStyles: StylesConfig<NodeOption, false> = {
  control: (provided) => ({
    ...provided,
    backgroundColor: '#202020',
    borderColor: '#6B7280', // Changed from gray-600 to gray-500
    color: '#D1D5DB',
    minHeight: '44px',
    boxShadow: 'none',
    '&:hover': { borderColor: '#6B7280' }, // Kept as gray-500
    fontSize: '1rem',
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: '#202020', // Changed from slate-800 to match app background
    borderColor: '#6B7280', // Changed from gray-600 to gray-500
    zIndex: 20,
    fontSize: '1rem',
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected ? '#ea6508' : state.isFocused ? '#374151' : '#202020', // Orange for selected, darker gray for focus, app bg for default
    color: state.isSelected ? '#FFFFFF' : '#D1D5DB',
    '&:active': { backgroundColor: '#c6441a' }, // Darker orange for active
  }),
  singleValue: (provided) => ({
    ...provided,
    color: '#F9FAFB',
  }),
  input: (provided) => ({
    ...provided,
    color: '#F9FAFB',
  }),
  placeholder: (provided) => ({
    ...provided,
    color: '#9CA3AF',
  }),
  indicatorSeparator: (provided) => ({
    ...provided,
    backgroundColor: '#6B7280', // Changed from gray-600 to gray-500
  }),
  dropdownIndicator: (provided) => ({
    ...provided,
    color: '#9CA3AF',
    '&:hover': { color: '#D1D5DB' },
  }),
  clearIndicator: (provided) => ({
    ...provided,
    color: '#9CA3AF',
    '&:hover': { color: '#EF4444' },
  }),
};

const selectTheme = (theme: Theme): Theme => ({
  ...theme,
  borderRadius: 6,
  colors: {
    ...theme.colors,
    primary: '#ea6508', // Main orange
    primary75: '#c6441a', // Darker orange for active states or intense focus
    primary50: '#ea6508', // Medium orange (can be same as primary)
    primary25: '#f97316', // Lighter orange (Tailwind orange-500) for hover/focus accents

    danger: '#EF4444',
    dangerLight: '#F87171',

    neutral0: '#202020',  // Menu background
    neutral5: '#202020',  // Control background
    neutral10: '#6B7280', // Control border (gray-500)
    neutral20: '#6B7280', // Control hover border, indicators (gray-500)
    neutral30: '#9CA3AF', // Placeholder text (gray-400)
    neutral40: '#9CA3AF', // Used for text sometimes
    neutral50: '#9CA3AF', // Disabled text
    neutral60: '#D1D5DB', // Default text (gray-300)
    neutral70: '#E5E7EB', // Lighter text (gray-200)
    neutral80: '#F9FAFB', // Input text, selected value text (gray-100)
    neutral90: '#FFFFFF', // Text on primary background (white)
  },
});

// Define the possible outcomes for the test
type TestOutcome = 'completed' | 'stopped' | 'error' | 'running';

const TwampRunner: React.FC<TwampRunnerProps> = ({ nodes, apiBaseUrl }) => {
  const [senderNodeId, setSenderNodeId] = useState<string>('');
  const [responderNodeId, setResponderNodeId] = useState<string>('');
  const [ipVersion, setIpVersion] = useState<IpVersion>('ipv4');
  const [port, setPort] = useState<string>('5000'); // Renamed from commonPort for clarity
  const [count, setCount] = useState<string>('100');
  const [interval, setIntervalValue] = useState<string>('100'); // State for interval input
  const [padding, setPadding] = useState<string>('0');
  const [ttl, setTtl] = useState<string>('64');
  const [tos, setTos] = useState<string>('0');
  const [doNotFragment, setDoNotFragment] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [maxWaitTime, setMaxWaitTime] = useState<number>(0);
  const [startTimeString, setStartTimeString] = useState<string>(''); // Store start time string
  const [senderResults, setSenderResults] = useState<Record<string, any> | null>(null); // State to hold results

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRunParamsRef = useRef<{
    ipVersion: IpVersion;
    port: string;
    senderNodeId: string;
    responderNodeId: string;
    responderIp: string;
  } | null>(null);
  // Explicitly type the ref to help TypeScript understand possible values
  const testOutcomeRef = useRef<TestOutcome>('running');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref for polling interval ID

  const nodeOptions = useMemo<NodeOption[]>(() => {
    return nodes
      .filter(node => node.status === 'online')
      .map(node => ({
        value: node.id,
        label: `${node.node_id || node.id} (${node.ip})`
      }));
  }, [nodes]);

  // Cleanup timer and abort controller on component unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current !== null) {
        clearInterval(progressIntervalRef.current);
      }
      abortControllerRef.current?.abort(); // Abort any ongoing fetch on unmount
    };
  }, []);

  // --- Helper to clear polling ---
  const clearPollingInterval = useCallback(() => {
      if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          console.log("Polling interval cleared.");
      }
  }, []); // Empty dependency array as it doesn't depend on props/state

  // --- useEffect for cleanup on unmount ---
  useEffect(() => {
      // Cleanup function to clear interval when component unmounts
      return () => {
          clearPollingInterval();
      };
  }, [clearPollingInterval]); // Depend on the memoized clear function

  // Function to execute the test on a node
  const executeTest = useCallback(async (nodeId: string, command: string, signal: AbortSignal): Promise<string> => {
    const response = await fetch(`${apiBaseUrl}/nodes/${nodeId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
      signal, // Pass the abort signal
    });
    const result = await response.json();
    if (!response.ok) {
      // Try to parse backend error message if available
      const errorMsg = result?.error || result?.detail || JSON.stringify(result);
      throw new Error(`Node '${nodeId}' API error: ${response.status} - ${errorMsg}`);
    }
    // Attempt to parse the output if it's a JSON string, otherwise return as is
    try {
        const parsedOutput = JSON.parse(result.output);
        // If parsing succeeds, format it
        return formatTwampResults(parsedOutput);
    } catch (parseError) {
        // If parsing fails, return the raw output string
        return result.output;
    }
  }, [apiBaseUrl]);

  // --- MODIFIED: Renamed and refactored from handleStop ---
  const stopAndCleanupProcesses = async (reason: 'completed' | 'stopped' | 'error' | 'timeout') => {
    console.log(`Initiating cleanup for reason: ${reason}`);

    // Get parameters from the last run
    const params = lastRunParamsRef.current;
    let stopError = ''; // Accumulate errors from stop commands

    if (!params || !params.responderNodeId || !params.senderNodeId || !params.responderIp || !params.port) {
        const errorMsg = 'Cannot cleanup test processes: Missing parameters from the last run.';
        // Update status only if not already completed/stopped cleanly
        if (reason !== 'completed' && reason !== 'stopped') {
            setStatusMessage(prev => `${prev}\n${errorMsg}`);
            setError(prev => `${prev}\n${errorMsg}`);
        }
        console.error("Cleanup failed:", errorMsg, params);
        return; // Cannot proceed
    }

    // Update status message to indicate cleanup attempt
    setStatusMessage(prev => `${prev}\nAttempting to stop processes on nodes...`);

    // --- Stop Responder ---
    const stopResponderCommand = `twamp ${params.ipVersion} stop responder port ${params.port}`;
    console.log(`Sending command to responder ${params.responderNodeId}: ${stopResponderCommand}`);
    try {
        // Use a short timeout for cleanup commands
        const stopFetchController = new AbortController();
        const stopTimeoutId = setTimeout(() => stopFetchController.abort(), 5000); // 5-second timeout

        const stopRes = await fetch(`${apiBaseUrl}/nodes/${params.responderNodeId}/execute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: stopResponderCommand }), signal: stopFetchController.signal,
        });
        clearTimeout(stopTimeoutId); // Clear timeout if fetch completed

        const stopResult = await stopRes.json();
        if (!stopRes.ok) {
             const errorDetail = stopResult?.detail || stopResult?.error || stopResult?.output || JSON.stringify(stopResult);
             throw new Error(`API Error ${stopRes.status}: ${errorDetail}`);
        }
        console.log("Responder stop command result:", stopResult.output);
        // Optionally update status, but keep it concise during cleanup
        // setStatusMessage(prev => `${prev}\nResponder stop: ${stopResult.output}`);

    } catch (err: any) {
        if (err.name === 'AbortError') { stopError += `Stop command to responder ${params.responderNodeId} timed out.\n`; }
        else { stopError += `Failed to stop responder on ${params.responderNodeId}: ${err.message}\n`; }
        console.error("Error sending stop command to responder:", err);
    }
    // --- End Stop Responder ---

    // --- Stop Sender ---
    // --- MODIFICATION: Only stop sender if not completed normally ---
    if (reason !== 'completed') {
        const stopSenderCommand = `twamp ${params.ipVersion} stop sender destination-ip ${params.responderIp} port ${params.port}`;
        console.log(`Sending command to sender ${params.senderNodeId}: ${stopSenderCommand}`);
        try {
            const stopFetchController = new AbortController();
            const stopTimeoutId = setTimeout(() => stopFetchController.abort(), 5000); // 5-second timeout

            const stopRes = await fetch(`${apiBaseUrl}/nodes/${params.senderNodeId}/execute`, { // Target SENDER node
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: stopSenderCommand }), signal: stopFetchController.signal,
            });
            clearTimeout(stopTimeoutId); // Clear timeout if fetch completed

            const stopResult = await stopRes.json();
            if (!stopRes.ok) {
                 const errorDetail = stopResult?.detail || stopResult?.error || stopResult?.output || JSON.stringify(stopResult);
                 throw new Error(`API Error ${stopRes.status}: ${errorDetail}`);
            }
            console.log("Sender stop command result:", stopResult.output);
            // Optionally update status
            // setStatusMessage(prev => `${prev}\nSender stop: ${stopResult.output}`);

        } catch (err: any) {
            if (err.name === 'AbortError') { stopError += `Stop command to sender ${params.senderNodeId} timed out.\n`; }
            else { stopError += `Failed to stop sender on ${params.senderNodeId}: ${err.message}\n`; }
            console.error("Error sending stop command to sender:", err);
        }
    } else {
        console.log("Skipping sender stop command because reason is 'completed'.");
    }
    // --- End Modification ---
    // --- End Stop Sender ---

    // Update final status based on stop command results
    if (stopError) {
        setStatusMessage(prev => `${prev}\nFinished cleanup attempt with errors.`);
        // Append stop errors to existing errors if any
        setError(prev => prev ? `${prev}\n${stopError.trim()}`: stopError.trim());
    } else {
        setStatusMessage(prev => `${prev}\nNode processes stopped successfully.`);
        console.log("Stop commands sent successfully during cleanup.");
    }
};


// --- handleSubmit ---
const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); // Clear previous errors
    setStatusMessage(''); // Clear previous status messages

    // Validate inputs
    if (!senderNodeId || !responderNodeId) {
        setError('Both sender and responder nodes must be selected.');
        return;
    }

    const validCount = Math.max(1, Math.min(10000, parseInt(count, 10) || 100));
    const validInterval = Math.max(10, Math.min(10000, parseInt(interval, 10) || 100));
    const startTime = new Date();
    const formattedStartTime = startTime.toLocaleString();
    setStartTimeString(formattedStartTime);

    // Calculate effective wait time (e.g., count * interval + buffer)
    const effectiveWaitTimeMs = validCount * validInterval + 2000; // 1-second buffer
    setMaxWaitTime(effectiveWaitTimeMs);

    // --- Calculate OTW Size ---
    const numericPadding = parseInt(padding, 10) || 0;
    const basePayloadSize = 4; // Sequence number
    const udpHeaderSize = 8;
    const ipv4HeaderSize = 20;
    const ipv6HeaderSize = 40;

    let otwSize = 0;
    if (ipVersion === 'ipv4') {
        otwSize = basePayloadSize + numericPadding + udpHeaderSize + ipv4HeaderSize;
    } else { // ipv6
        otwSize = basePayloadSize + numericPadding + udpHeaderSize + ipv6HeaderSize;
    }
    const otwSizeString = `${otwSize} bytes`;
    // --- End Calculate OTW Size ---

    // Format parameters for output
    const senderLabel = nodeOptions.find(o => o.value === senderNodeId)?.label || senderNodeId;
    // --- FIX: Use the looked-up responderNode for the label ---
    const responderNode = nodes.find(node => node.id === responderNodeId);
    const responderLabel = responderNode ? `${responderNode.node_id || responderNode.id} (${responderNode.ip})` : responderNodeId;
    // --- End Fix ---


    // Initial summary - no "Completed" line yet
    const paramsSummary = `---------------------------------------
TWAMP Benchmark - vMark:
  Started:      ${formattedStartTime}
----------------------------------------
Settings used:

  Sender:       ${senderLabel}
  Responder:    ${responderLabel}
  IP Version:   ${ipVersion}
  Port:         ${port}
  Count:        ${validCount}
  Interval:     ${validInterval} ms
  Padding:      ${padding} bytes
  OTW Size:     ${otwSizeString}
  TTL:          ${ttl}
  ToS/DSCP:     ${tos}
  DF Bit (IPv4): ${ipVersion === 'ipv4' ? (doNotFragment ? 'Set' : 'Not Set') : 'N/A'}
----------------------------------------
`;
    setOutput(paramsSummary + '\n');
    // --- End Format Parameters ---

    setIsLoading(true); // Set loading true at the start
    startTimeRef.current = startTime.getTime();

    // --- Start Progress Timer ---
    progressIntervalRef.current = setInterval(() => {
      const elapsedMs = Date.now() - startTimeRef.current;
      const calculatedProgress = effectiveWaitTimeMs > 0
          ? Math.min(100, (elapsedMs / effectiveWaitTimeMs) * 100)
          : 0;
      setProgress(calculatedProgress); // Update progress state

      // Stop timer if it exceeds max time (should also be handled by timeout)
      if (elapsedMs >= effectiveWaitTimeMs && progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
          setProgress(100); // Ensure it hits 100%
      }
    // --- MODIFIED: Decrease interval for smoother updates ---
    }, 10); // Update 10 times per second (adjust lower if needed, e.g., 50ms)
    // --- End Modification ---
    // --- End Start Timer ---

    // --- FIX: Look up the actual IP address of the responder node ---
    if (!responderNode) {
        setError(`Could not find details for selected responder node ID: ${responderNodeId}`);
        setIsLoading(false);
        return;
    }
    const responderIp = responderNode.ip; // Use the IP from the found node object
    // --- End Fix ---

    lastRunParamsRef.current = {
        ipVersion,
        port,
        senderNodeId,
        responderNodeId,
        responderIp, // Now correctly holds the IP address (e.g., '192.168.178.233')
    };

    // --- Build Commands ---
    const responderCmdParts = [
      `twamp ${ipVersion} responder port ${port}`,
      // Add other relevant responder options based on state if needed
      // e.g., `padding ${padding}`, `ttl ${ttl}`, `tos ${tos}`
      // Note: Responder usually doesn't need count/interval/dest-ip
    ];
    // Filter out any empty strings if optional parts were added
    const responderCommand = responderCmdParts.filter(part => part).join(' ');

    const senderCmdParts = [
      `twamp ${ipVersion} sender destination-ip ${responderIp} port ${port}`, // Command becomes '... destination-ip correct IP port 5000'
      `count ${validCount}`, // Use validated count
      `interval ${validInterval}`, // Use validated interval (ms)
      `padding ${padding}`,
      `ttl ${ttl}`,
      `tos ${tos}`,
      (ipVersion === 'ipv4' && doNotFragment) ? 'do-not-fragment' : ''
    ];
    // Filter out the empty string from the conditional DF bit part
    const senderCommand = senderCmdParts.filter(part => part).join(' ');
    // --- End Build Commands ---

    // --- Execute Tests ---
    try {
      setStatusMessage('Starting responder...');
      const responderStartOutput = await executeTest(responderNodeId, responderCommand, new AbortController().signal);
      setOutput(prev => prev + `Benchmark logs:
- Responder: ${responderStartOutput}\n`);
      setStatusMessage('Responder start command sent. Starting sender...');

      await sleep(500);
      if (new AbortController().signal.aborted) throw new Error('Test aborted before sender start.');

      setStatusMessage('Running sender test...');

      // Sender now runs async
      const senderStartPromise = executeTest(senderNodeId, senderCommand, new AbortController().signal);
      const timeoutPromise = new Promise<never>((_, reject) => { /* ... refined timeout logic ... */ });
      const senderStartOutput = await Promise.race([senderStartPromise, timeoutPromise]) as string;

      // Check if sender started successfully
      if (typeof senderStartOutput !== 'string' || senderStartOutput.toLowerCase().includes('error') || !senderStartOutput.toLowerCase().includes('started successfully')) {
           throw new Error(`Sender start failed or unexpected output: ${senderStartOutput}`);
      }

      // --- SUCCESS PATH (Sender Started) ---
      testOutcomeRef.current = 'running';
      setOutput(prev => prev + `- Sender: ${senderStartOutput}\n`);
      setStatusMessage('Sender test running. Polling for results...');

      // --- Start Polling for Results ---
      pollingIntervalRef.current = setInterval(async () => {
          if (new AbortController().signal.aborted) { // Check if main abort signal was triggered
              clearPollingInterval();
              return;
          }

          console.log("Polling for sender status/results...");
          try {
              // Construct query parameters for the status endpoint
              const queryParams = new URLSearchParams({
                  ip_version: ipVersion || 'ipv4',
                  dest_ip: responderIp || '',
                  port: (port || 0).toString(),
              });

              const statusRes = await fetch(`${apiBaseUrl}/nodes/${senderNodeId}/twamp/status?${queryParams.toString()}`, {
                  signal: new AbortController().signal // Use the main abort signal for polling fetches too
              });

              if (!statusRes.ok) {
                  // Handle non-2xx responses from status endpoint
                  const errorData = await statusRes.json().catch(() => ({ detail: `Status endpoint error: ${statusRes.status}` }));
                  throw new Error(errorData.detail || `Status poll failed: ${statusRes.status}`);
              }

              const statusData = await statusRes.json();

              if (statusData.status === 'completed') {
                  console.log("Polling: Test completed. Results received.");
                  clearPollingInterval();
                  setSenderResults(statusData.results);
                  const formattedResults = formatTwampResults(statusData.results);

                  // --- FIX: Add End Time to Output ---
                  const endTime = new Date();
                  const formattedEndTime = endTime.toLocaleString();
                  // Update the output state by adding the end time and results
                  setOutput(prev => {
                      // Find the end of the header block
                      const headerEndIndex = prev.indexOf('----------------------------------------\n') + '----------------------------------------\n'.length;
                      const header = prev.substring(0, headerEndIndex);
                      const body = prev.substring(headerEndIndex);
                      // Insert the "Ended:" line into the header
                      const updatedHeader = header.replace(
                          '----------------------------------------\n', // Find the first separator
                          `  Ended:        ${formattedEndTime}\n----------------------------------------\n` // Insert Ended time before it
                      );
                      return updatedHeader + body + formattedResults; // Combine updated header, existing body, and new results
                  });
                  // --- End Fix ---

                  setStatusMessage('Test completed successfully.');
                  testOutcomeRef.current = 'completed';
                  setIsLoading(false); // Stop loading indicator
                  setProgress(100); // Ensure progress is 100
                  // Clear progress timer if it's somehow still running
                  if (progressIntervalRef.current) {
                      clearInterval(progressIntervalRef.current);
                      progressIntervalRef.current = null;
                  }

                  // --- MODIFICATION: Call cleanup after completion ---
                  await stopAndCleanupProcesses('completed');
                  // --- End Modification ---

              } else if (statusData.status === 'running') {
                  // Still running, continue polling
                  console.log("Polling: Test still running.");
              } else { // 'unknown' or other unexpected status
                  console.error("Polling: Unknown status or error:", statusData);
                  clearPollingInterval();
                  if (testOutcomeRef.current === 'running') testOutcomeRef.current = 'error';
                  setError(prev => `${prev}\nFailed to retrieve final test status or results: ${statusData.error || statusData.status || 'Unknown reason'}`);
                  setStatusMessage('Failed to get final test status.');
                  setIsLoading(false); // Stop loading
                  // --- MODIFICATION: Call cleanup on unknown status ---
                  await stopAndCleanupProcesses('error');
                  // --- End Modification ---
              }

          } catch (pollErr: any) {
              if (pollErr.name === 'AbortError') {
                  console.log("Polling fetch aborted."); // Expected on user stop/timeout
                  clearPollingInterval(); // Ensure cleared on abort
                  return; // Stop polling
              }
              console.error("Polling error:", pollErr);
              clearPollingInterval();
              if (testOutcomeRef.current === 'running') testOutcomeRef.current = 'error';
              setError(prev => `${prev}\nError polling for results: ${pollErr.message}`);
              setStatusMessage('Error checking test status.');
              setIsLoading(false); // Stop loading
              // --- MODIFICATION: Call cleanup on polling error ---
              await stopAndCleanupProcesses('error');
              // --- End Modification ---
          }
      // --- Polling Interval (e.g., every 2 seconds) ---
      }, 2000);
      // --- End Start Polling ---

      // --- Wait for Timeout or Abort ---
      // The timeoutPromise handles the overall duration. Polling happens concurrently.
      await timeoutPromise;
      // If timeoutPromise resolves unexpectedly:
      throw new Error("Test finished unexpectedly without timeout or error.");

    } catch (err: any) {
      // --- CATCH BLOCK (Handles Start Errors, Timeout, Abort) ---
      clearPollingInterval(); // Ensure polling stops on any error/abort

      // --- MODIFICATION: Clearer check for stopping loading ---
      // Stop loading unless it was specifically a user-initiated stop
      const isUserStop = err.name === 'AbortError' && testOutcomeRef.current === ('stopped' as TestOutcome);
      if (!isUserStop) {
          setIsLoading(false);
      }
      // --- End Modification ---

      // ... (rest of existing catch block logic: logging, setting error/status based on err type) ...
      if (err instanceof Error && err.message.startsWith('Test timed out after')) {
          // ... timeout handling ...
      } else if (err.name === 'AbortError') {
          // ... abort handling ...
      } else {
          // ... other error handling ...
      }
    } finally {
        // ... finally block ...
    }
  };

  // Function to handle stopping the test
  const handleStopClick = async () => {
    console.log("Stop button clicked");
    if (testOutcomeRef.current !== 'running') return;

    testOutcomeRef.current = 'stopped';
    // --- Define stopTime HERE ---
    const stopTime = new Date().toLocaleString();
    // --- Define currentAbortController HERE ---
    const currentAbortController = abortControllerRef.current;

    // 1. Abort frontend operations & Update UI immediately
    clearPollingInterval(); // Clear polling interval immediately
    currentAbortController?.abort(); // Aborts the main fetch AND any ongoing polling fetches
    setIsLoading(false);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress(100);
    const userStopMsg = 'Stop requested by user.';
    setError(prev => prev ? `${prev}\n${userStopMsg}` : userStopMsg);
    setStatusMessage('Attempting to stop test processes on nodes...');
    setOutput(prev => prev.trimEnd() + `\nTest Stopped At: ${stopTime}\n`);

    // 2. Send stop command(s) to the backend API
    const params = lastRunParamsRef.current;
    let stopError = ''; // Accumulate errors from stop commands

    if (!params || !params.responderNodeId || !params.senderNodeId || !params.responderIp || !params.port) {
        const errorMsg = 'Cannot stop test: Missing parameters from the last run.';
        setStatusMessage(prev => `${prev}\n${errorMsg}`);
        setError(prev => `${prev}\n${errorMsg}`);
        console.error("Stop failed:", errorMsg, params);
        return;
    }

    // --- Stop Responder ---
    const stopResponderCommand = `twamp ${params.ipVersion} stop responder port ${params.port}`;
    setStatusMessage(prev => `${prev}\nSending stop to responder node ${params.responderNodeId}...`);
    try {
        const stopFetchController = new AbortController();
        const stopTimeoutId = setTimeout(() => stopFetchController.abort(), 5000);
        const stopRes = await fetch(`${apiBaseUrl}/nodes/${params.responderNodeId}/execute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: stopResponderCommand }), signal: stopFetchController.signal,
        });
        clearTimeout(stopTimeoutId);
        const stopResult = await stopRes.json();
        if (!stopRes.ok) {
             const errorDetail = stopResult?.detail || stopResult?.error || stopResult?.output || JSON.stringify(stopResult);
             throw new Error(`API Error ${stopRes.status}: ${errorDetail}`);
        }
        setStatusMessage(prev => `${prev}\nResponder stop result: ${stopResult.output}`);
        console.log("Responder stop command sent:", stopResult.output);
    } catch (err: any) {
        if (err.name === 'AbortError') { stopError += `Stop command to responder ${params.responderNodeId} timed out.\n`; }
        else { stopError += `Failed to stop responder on ${params.responderNodeId}: ${err.message}\n`; }
        console.error("Error sending stop command to responder:", err);
    }
    // --- End Stop Responder ---

    // --- Stop Sender ---
    const stopSenderCommand = `twamp ${params.ipVersion} stop sender destination-ip ${params.responderIp} port ${params.port}`;
    setStatusMessage(prev => `${prev}\nSending stop to sender node ${params.senderNodeId}...`);
    try {
        const stopFetchController = new AbortController();
        const stopTimeoutId = setTimeout(() => stopFetchController.abort(), 5000);
        const stopRes = await fetch(`${apiBaseUrl}/nodes/${params.senderNodeId}/execute`, { // Target SENDER node
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: stopSenderCommand }), signal: stopFetchController.signal,
        });
        clearTimeout(stopTimeoutId);
        const stopResult = await stopRes.json();
        if (!stopRes.ok) {
             const errorDetail = stopResult?.detail || stopResult?.error || stopResult?.output || JSON.stringify(stopResult);
             throw new Error(`API Error ${stopRes.status}: ${errorDetail}`);
        }
        setStatusMessage(prev => `${prev}\nSender stop result: ${stopResult.output}`);
        console.log("Sender stop command sent:", stopResult.output);
    } catch (err: any) {
        if (err.name === 'AbortError') { stopError += `Stop command to sender ${params.senderNodeId} timed out.\n`; }
        else { stopError += `Failed to stop sender on ${params.senderNodeId}: ${err.message}\n`; }
        console.error("Error sending stop command to sender:", err);
    }
    // --- End Stop Sender ---


    // Update final status based on stop command results
    if (stopError) {
        setStatusMessage(prev => `${prev}\nFinished stop attempt with errors.`);
        setError(prev => `${prev}\n${stopError.trim()}`);
    } else {
        setStatusMessage(prev => `${prev}\nStop commands sent successfully.`);
    }
  };

  // --- JSX Rendering ---
  return (
    <div className="p-4 bg-[#202020] rounded-lg shadow-md border border-gray-500 text-gray-300">
      <h2 className="text-xl font-semibold mb-4 text-white">Ad-hoc RFC5357 Benchmark:</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Sender/Responder Nodes (No Change) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sender Node Select */}
          <div>
            <label htmlFor="senderNode" className="block text-sm font-medium mb-1">Sender Node:</label>
            <Select<NodeOption>
              id="senderNode"
              options={nodeOptions}
              value={nodeOptions.find(o => o.value === senderNodeId) || null}
              onChange={(option: SingleValue<NodeOption>) => setSenderNodeId(option ? option.value : '')}
              styles={selectStyles}
              theme={selectTheme}
              placeholder="Select Sender..."
              isClearable
            />
          </div>
          {/* Responder Node Select */}
          <div>
            <label htmlFor="responderNode" className="block text-sm font-medium mb-1">Responder Node:</label>
            <Select<NodeOption>
              id="responderNode"
              options={nodeOptions}
              value={nodeOptions.find(o => o.value === responderNodeId) || null}
              onChange={(option: SingleValue<NodeOption>) => setResponderNodeId(option ? option.value : '')}
              styles={selectStyles}
              theme={selectTheme}
              placeholder="Select Responder..."
              isClearable
            />
          </div>
        </div>

        {/* Row 2: IP Version, DF Bit, Port, Count, Interval */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-3 items-end">
          {/* IP Version */}
          <div>
            <label className="block text-sm font-medium mb-1">IP Version:</label>
            <div className="flex rounded-md shadow-sm">
              <button type="button" onClick={() => setIpVersion('ipv4')} className={`px-4 py-2 border border-gray-500 rounded-l-md text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#c6441a] ${ipVersion === 'ipv4' ? 'bg-[#c6441a] text-white' : 'bg-[#202020] hover:bg-[#202020]'}`}>IPv4</button>
              <button type="button" onClick={() => setIpVersion('ipv6')} className={`px-4 py-2 border-t border-b border-r border-gray-500 rounded-r-md text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#c6441a] ${ipVersion === 'ipv6' ? 'bg-[#c6441a] text-white' : 'bg-[#202020] hover:bg-[#202020]'}`}>IPv6</button>
            </div>
          </div>

          {/* --- MODIFIED: DF Bit Checkbox to Button Group --- */}
          <div>
            <label className="block text-sm font-medium mb-1">DF Bit (IPv4):</label>
            <div className="flex rounded-md shadow-sm">
              <button
                type="button"
                onClick={() => setDoNotFragment(true)}
                disabled={ipVersion === 'ipv6'} // Disable if IPv6
                className={`px-4 py-2 border border-gray-500 rounded-l-md text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#c6441a] disabled:opacity-50 disabled:cursor-not-allowed ${
                  doNotFragment && ipVersion === 'ipv4' ? 'bg-[#c6441a] text-white' : 'bg-[#202020] hover:bg-[#202020]'
                }`}
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => setDoNotFragment(false)}
                disabled={ipVersion === 'ipv6'} // Disable if IPv6
                className={`px-4 py-2 border-t border-b border-r border-gray-500 rounded-r-md text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#c6441a] disabled:opacity-50 disabled:cursor-not-allowed ${
                  !doNotFragment && ipVersion === 'ipv4' ? 'bg-[#c6441a] text-white' : 'bg-[#202020] hover:bg-[#202020]'
                }`}
              >
                Clear
              </button>
            </div>
          </div>
          {/* --- End Modification --- */}

          {/* Port */}
          <div>
            <label htmlFor="port" className="block text-sm font-medium mb-1">Port:</label>
            <input type="number" id="port" value={port} onChange={(e) => setPort(e.target.value)} min="1024" max="65535" required className="w-full p-2 bg-[#202020] border border-gray-500 rounded-md focus:ring-[#c6441a] focus:border-[#c6441a] text-sm" />
          </div>
          {/* Count */}
          <div>
            <label htmlFor="count" className="block text-sm font-medium mb-1">Count:</label>
            <input type="number" id="count" value={count} onChange={(e) => setCount(e.target.value)} min="1" max="10000" required className="w-full p-2 bg-[#202020] border border-gray-500 rounded-md focus:ring-[#c6441a] focus:border-[#c6441a] text-sm" />
          </div>
          {/* Interval */}
          <div>
            <label htmlFor="interval" className="block text-sm font-medium mb-1">Interval (ms):</label>
            <input type="number" id="interval" value={interval} onChange={(e) => setIntervalValue(e.target.value)} min="10" max="10000" required className="w-full p-2 bg-[#202020] border border-gray-500 rounded-md focus:ring-[#c6441a] focus:border-[#c6441a] text-sm" />
          </div>
        </div>

        {/* Row 3: Optional Params (Padding, TTL, ToS) & Buttons */}
        {/* --- MODIFIED: Removed DF Bit, added Buttons, adjusted grid --- */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 items-end">
          {/* Padding */}
          <div>
            <label htmlFor="padding" className="block text-sm font-medium mb-1">Padding (bytes):</label>
            <input type="number" id="padding" value={padding} onChange={(e) => setPadding(e.target.value)} min="0" max="9000" className="w-full p-2 bg-[#202020] border border-gray-500 rounded-md focus:ring-[#c6441a] focus:border-[#c6441a] text-sm" />
          </div>
          {/* TTL */}
          <div>
            <label htmlFor="ttl" className="block text-sm font-medium mb-1">TTL:</label>
            <input type="number" id="ttl" value={ttl} onChange={(e) => setTtl(e.target.value)} min="1" max="255" className="w-full p-2 bg-[#202020] border border-gray-500 rounded-md focus:ring-[#c6441a] focus:border-[#c6441a] text-sm" />
          </div>
          {/* ToS */}
          <div>
            <label htmlFor="tos" className="block text-sm font-medium mb-1">ToS/DSCP:</label>
            <input type="number" id="tos" value={tos} onChange={(e) => setTos(e.target.value)} min="0" max="255" className="w-full p-2 bg-[#202020] border border-gray-500 rounded-md focus:ring-[#c6441a] focus:border-[#c6441a] text-sm" />
          </div>
          {/* --- MOVED: Run/Stop Buttons --- */}
          {/* Make buttons span the remaining space or adjust grid as needed */}
          <div className="flex space-x-4 md:col-span-1"> {/* Adjust col-span if needed */}
             <button type="submit" disabled={isLoading} className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#c6441a] hover:bg-[#c6441a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#c6441a] disabled:opacity-50 disabled:cursor-not-allowed">
               <ClipLoader size={20} color={"#ffffff"} loading={isLoading} className="mr-2" />
               {isLoading ? 'Running...' : 'Run'} {/* Shortened text */}
             </button>
             <button type="button" onClick={handleStopClick} disabled={!isLoading} className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-500 text-sm font-medium rounded-md shadow-sm text-gray-300 bg-[#202020] hover:bg-[#202020] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">
               Stop
             </button>
          </div>
        </div>

        {/* --- REMOVED: Original Row 4 with buttons --- */}

      </form>

      {/* Progress Bar */}
      {isLoading && (
        <div className="mt-4 w-full bg-[#202020] rounded-full h-2.5">
          <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {/* Status Message */}
      {statusMessage && (
        <div className="mt-4 p-3 bg-[#202020] border border-gray-500 rounded-md text-sm">
          {statusMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded-md text-sm text-red-100 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {/* Output Area */}
      {(output || error) && ( // Show output area if there's output OR an error
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2 text-white">Output:</h3>
          <pre className="p-3 bg-[#202020] border border-gray-500 rounded-md text-sm text-gray-300 whitespace-pre-wrap overflow-x-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
};

export default TwampRunner;
