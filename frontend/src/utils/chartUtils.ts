import { FormattedLatencyData } from '../types';
import { RawLatencyData } from '../types';

// --- optimizeChartData function (lines 72-146 from App.tsx) ---
export function optimizeChartData(data: FormattedLatencyData[], maxPoints = 200): FormattedLatencyData[] { // Increased default maxPoints based on previous change
  if (!data || data.length === 0) return [];

  // Adjust actualMaxPoints based on data size if needed (optional)
  const actualMaxPoints = data.length > 1000 ? 100 : maxPoints; // Example adjustment
  if (data.length <= actualMaxPoints) return data;

  // Calculate skip based on actualMaxPoints
  const skip = Math.ceil(data.length / actualMaxPoints);

  const result: FormattedLatencyData[] = [];
  let lastValue: number | null = null;
  let sumSinceLastSample = 0;
  let countSinceLastSample = 0;

  for (let i = 0; i < data.length; i++) {
    const currentPoint = data[i];
    const currentLatency = currentPoint.latency;
    const prevPointLatency = data[i-1]?.latency; // Get previous point's latency

    // Always keep the very first point
    if (i === 0) {
      result.push(currentPoint);
      lastValue = currentLatency;
      continue;
    }

    // --- Handling Null (Offline) Transitions ---
    // 1. If current is null (start or continuation of downtime)
    if (currentLatency === null) {
      // If the *previous* point was NOT null, we are transitioning TO offline.
      // Add the average of points since the last sample *before* this null point.
      if (prevPointLatency !== null && countSinceLastSample > 0) {
         const avgLatency = sumSinceLastSample / countSinceLastSample;
         // Use the previous point's time for the average representation
         result.push({ time: data[i-1].time, latency: avgLatency });
      }
      // Always add the null point itself to mark downtime
      if (result[result.length - 1]?.time !== currentPoint.time) { // Avoid duplicates if avg was just added
          result.push(currentPoint);
      }
      lastValue = null;
      sumSinceLastSample = 0;
      countSinceLastSample = 0;
      continue; // Move to next point
    }

    // --- Handling Non-Null (Online) Points ---
    // 2. If current is NOT null, but the *previous* point WAS null (transition FROM offline)
    // We MUST keep this point to mark the end of downtime accurately.
    const justCameOnline = prevPointLatency === null && currentLatency !== null;

    // Accumulate for averaging
    sumSinceLastSample += currentLatency;
    countSinceLastSample++;

    // Determine if we should add a point based on skip, significant change, end, or transition
    const significantChange = lastValue !== null && Math.abs(currentLatency - lastValue) > (lastValue * 0.25); // Example threshold
    const isLastPoint = i === data.length - 1;
    const nextPointIsNull = data[i+1]?.latency === null; // Keep point before downtime starts

    if (
        justCameOnline ||          // Always keep the first point after downtime
        i % skip === 0 ||          // Keep based on regular sampling interval
        significantChange ||       // Keep if latency changed significantly
        nextPointIsNull ||         // Keep the last point before downtime
        isLastPoint                // Always keep the very last point
    ) {
      // Calculate average latency since the last kept point
      const avgLatency = countSinceLastSample > 0
        ? sumSinceLastSample / countSinceLastSample
        : currentLatency; // Should not happen if countSinceLastSample is 0, but fallback

      // Add the averaged point (or the specific point if justCameOnline/significantChange?)
      // Using the current time is generally best here.
      result.push({
        time: currentPoint.time,
        latency: avgLatency // Using average smooths the line between kept points
        // Alternatively, for justCameOnline, you might want the exact value:
        // latency: justCameOnline ? currentLatency : avgLatency
      });

      lastValue = currentLatency; // Update last kept value
      sumSinceLastSample = 0;
      countSinceLastSample = 0;
    }
  }
  return result;
}

// --- generateOfflineSegments function (lines 148-169 from App.tsx) ---
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
    const isOffline = point.latency === null;

    if (isOffline && segmentStart === null) {
      // Start of an offline segment
      segmentStart = point.time;
    } else if (!isOffline && segmentStart !== null) {
      // End of an offline segment
      // Use the current point's time as the end boundary
      segments.push({ x1: segmentStart, x2: point.time });
      segmentStart = null;
    }

    // Handle case where the data ends during an offline segment
    if (isOffline && i === data.length - 1 && segmentStart !== null) {
       // Use the last point's time as the end. If there's a next expected interval,
       // you might want to calculate that, but using the last known point is safer.
       segments.push({ x1: segmentStart, x2: point.time });
    }
  }

  // Handle edge case: If the *entire* dataset is offline
  if (segmentStart !== null && segments.length === 0 && data.length > 0) {
     segments.push({ x1: data[0].time, x2: data[data.length - 1].time });
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
  raw.map(({ time, latency }) => ({
    time: new Date(time + 'Z').getTime(), // Ensure UTC is parsed correctly
    latency,
  }));

// --- statusColor function (lines 38-39 from App.tsx) ---
export const statusColor = (status: string) =>
  status === 'online' ? 'bg-green-500' : 'bg-red-500';