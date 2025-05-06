import { FormattedLatencyData, RawLatencyData } from '../types'; // Ensure RawLatencyData is imported if needed elsewhere

// --- optimizeChartData function ---
export function optimizeChartData(data: FormattedLatencyData[], maxPoints = 200): FormattedLatencyData[] {
  if (!data || data.length === 0) return [];

  // Use the passed maxPoints directly as the target.
  // The existing check below handles cases where data is already sparser than maxPoints.
  const actualMaxPoints = maxPoints;

  // If data length is already less than or equal to the desired maxPoints,
  // no optimization is needed, or we can't make it more detailed than it is.
  if (data.length <= actualMaxPoints) {
    return data;
  }

  const skip = Math.ceil(data.length / actualMaxPoints);
  const result: FormattedLatencyData[] = [];
  let lastValue: number | null = null;
  let sumSinceLastSample = 0;
  let countSinceLastSample = 0;

  for (let i = 0; i < data.length; i++) {
    const currentPoint = data[i];
    const currentLatency = currentPoint.latency_ms;
    const prevPointLatency = data[i-1]?.latency_ms;

    if (i === 0) {
      result.push(currentPoint);
      lastValue = currentLatency;
      continue;
    }

    if (currentLatency === null) {
      if (prevPointLatency !== null && countSinceLastSample > 0) {
         const avgLatency = sumSinceLastSample / countSinceLastSample;
         result.push({ time: data[i-1].time, latency_ms: avgLatency });
      }
      if (result.length === 0 || result[result.length - 1]?.time !== currentPoint.time) {
          result.push(currentPoint);
      }
      lastValue = null;
      sumSinceLastSample = 0;
      countSinceLastSample = 0;
      continue;
    }

    const justCameOnline = prevPointLatency === null && currentLatency !== null;

    sumSinceLastSample += currentLatency;
    countSinceLastSample++;

    const significantChange = lastValue !== null && Math.abs(currentLatency - lastValue) > (lastValue * 0.25); // Heuristic for significant change
    const isLastPoint = i === data.length - 1;
    const nextPointIsNull = data[i+1]?.latency_ms === null;

    if (
        justCameOnline ||
        i % skip === 0 ||
        significantChange ||
        nextPointIsNull ||
        isLastPoint
    ) {
      const avgLatency = countSinceLastSample > 0
        ? sumSinceLastSample / countSinceLastSample
        : currentLatency; // Should be currentLatency if count is 0

      result.push({
        time: currentPoint.time,
        latency_ms: avgLatency
      });

      lastValue = currentLatency; // Update lastValue with the actual current latency, not average
      sumSinceLastSample = 0;
      countSinceLastSample = 0;
    }
  }
  return result;
}

// --- generateOfflineSegments function ---
/**
 * Identifies contiguous segments where latency is null (offline).
 * @param data - The formatted chart data array.
 * @returns An array of objects representing offline segments { x1: start time, x2: end time }.
 */
export const generateOfflineSegments = (data: FormattedLatencyData[]): { x1: number; x2: number }[] => {
  const segments: { x1: number; x2: number }[] = [];
  let segmentStart: number | null = null;

  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    const isOffline = point.latency_ms === null; // Use latency_ms

    if (isOffline && segmentStart === null) {
      // Start of an offline segment
      segmentStart = point.time;
    } else if (!isOffline && segmentStart !== null) {
      // End of an offline segment
      // Use the time of the *previous* point (the last offline one) as the end
      const segmentEnd = data[i-1].time;
      segments.push({ x1: segmentStart, x2: segmentEnd });
      segmentStart = null;
    }
  }

  // If the data ends while offline, close the last segment
  if (segmentStart !== null) {
    segments.push({ x1: segmentStart, x2: data[data.length - 1].time });
  }

  // Handle case where the entire dataset might be offline
  if (segments.length === 0 && data.length > 0 && data.every(p => p.latency_ms === null)) { // Use latency_ms
     segments.push({ x1: data[0].time, x2: data[data.length - 1].time });
  }

  return segments;
};

/**
 * Identifies significant time gaps between consecutive data points.
 * @param data - The formatted chart data array (should be sorted by time).
 * @param xAxisDomain - The domain of the x-axis.
 * @param thresholdMilliseconds - The minimum gap duration to report (e.g., 2 minutes).
 * @returns An array of objects representing missing data segments { x1: start time, x2: end time }.
 */
export const generateMissingDataSegments = (
  data: FormattedLatencyData[],
  xAxisDomain: [number, number], // Add xAxisDomain as a parameter
  thresholdMilliseconds: number = 2 * 60 * 1000 // Default to 2 minutes
): { x1: number; x2: number }[] => {
  const segments: { x1: number; x2: number }[] = [];
  const [domainStart, domainEnd] = xAxisDomain;

  if (!data || data.length === 0) {
    // If no data, the entire domain is "missing"
    // Only add if the domain itself is valid (start < end)
    if (domainStart < domainEnd) {
      segments.push({ x1: domainStart, x2: domainEnd });
    }
    return segments;
  }

  // Sort data just in case, though it should be sorted from formatChartData
  const sortedData = [...data].sort((a, b) => a.time - b.time);

  let lastKnownTime = domainStart;

  // Check for gap at the beginning
  if (sortedData[0].time - lastKnownTime > thresholdMilliseconds) {
    segments.push({ x1: lastKnownTime, x2: sortedData[0].time });
  }
  lastKnownTime = sortedData[0].time; // Initialize with the first data point's time

  // Check for internal gaps
  for (let i = 0; i < sortedData.length; i++) {
    const point = sortedData[i];
    if (point.time - lastKnownTime > thresholdMilliseconds) {
      segments.push({ x1: lastKnownTime, x2: point.time });
    }
    lastKnownTime = point.time;
  }

  // Check for gap at the end
  if (domainEnd - lastKnownTime > thresholdMilliseconds) {
    segments.push({ x1: lastKnownTime, x2: domainEnd });
  }

  return segments;
};

// --- calculateDynamicTicks function (lines 824-849 from App.tsx) ---
export function calculateDynamicTicks(data: { time: number }[], maxTicks: number = 6): number[] {
  if (!data || data.length <= 1) return [];

  const start = data[0].time;
  const end = data[data.length - 1].time;
  const totalRange = end - start;

  const tickCount = Math.min(maxTicks, 6);
  // Avoid division by zero if tickCount is 1 or less
  if (tickCount <= 1) return [start];

  const ticks: number[] = [];
  ticks.push(start);

  if (tickCount > 2) {
    const step = totalRange / (tickCount - 1);
    for (let i = 1; i < tickCount - 1; i++) {
      ticks.push(start + (step * i));
    }
  }

  if (!ticks.includes(end)) {
    ticks.push(end);
  }

  // Ensure ticks are sorted numerically
  return ticks.sort((a, b) => a - b);
}

// --- formatChartData function (lines 270-274 from App.tsx) ---
export const formatChartData = (raw: RawLatencyData[]): FormattedLatencyData[] =>
  raw.map(({ time, latency_ms }) => ({ // Use latency_ms here
    time: new Date(time).getTime(), // Assuming backend returns ISO string parsable by Date
    latency_ms, // Keep the original property name
  }));

// --- statusColor function (lines 38-39 from App.tsx) ---
export const statusColor = (status: string) =>
  status === 'online' ? 'bg-green-500' : 'bg-red-500';