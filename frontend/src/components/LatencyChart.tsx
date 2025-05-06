import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  TooltipProps
} from 'recharts';
import { NameType, Payload, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { FormattedLatencyData } from '../types';
import { generateOfflineSegments, generateMissingDataSegments } from '../utils/chartUtils';

interface LatencyChartProps {
  chartData: FormattedLatencyData[];
  timeRange: 2 | 6 | 12 | 24;
  timezone: 'local' | 'utc';
  nodeId: string;
}

const LatencyChart: React.FC<LatencyChartProps> = ({
  chartData,
  timeRange,
  timezone,
  nodeId
}) => {
  // 1. Define the X-axis domain first
  const xAxisDomain = useMemo((): [number, number] => {
    const now = Date.now(); // Current time in milliseconds
    const startTime = now - (timeRange * 60 * 60 * 1000); // Start time based on timeRange
    return [startTime, now];
  }, [timeRange]); // Recalculate if timeRange changes

  // 2. Then, use xAxisDomain in the calculation for missingDataSegments
  const {
    yAxisMax,
    offlineSegments,
    missingDataSegments
  } = useMemo(() => {
    const validLatencyPoints = chartData.filter(point => typeof point.latency_ms === 'number');
    const maxLatency = validLatencyPoints.reduce((max, point) => {
      const latencyValue = typeof point.latency_ms === 'number' ? point.latency_ms : 0;
      return Math.max(max, latencyValue);
    }, 0);
    const calculatedYAxisMax = Math.max(16, Math.ceil(maxLatency * 1.1));

    const calculatedOfflineSegments = generateOfflineSegments(chartData);
    // Pass the correctly defined xAxisDomain here
    const calculatedMissingDataSegments = generateMissingDataSegments(chartData, xAxisDomain, 120000); // 2 minutes threshold

    return {
        yAxisMax: calculatedYAxisMax,
        offlineSegments: calculatedOfflineSegments,
        missingDataSegments: calculatedMissingDataSegments
    };
  }, [chartData, xAxisDomain]); // Add xAxisDomain as a dependency

  // Remove the early returns that prevent the chart from rendering its structure
  // if (!chartData || chartData.length === 0) { ... }
  // if (!hasValidData && offlineSegments.length === 0) { ... }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData} // chartData can be empty, Recharts handles it
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={xAxisDomain} // Use the calculated fixed domain
          tickCount={7} // Suggest a number of ticks
          tickFormatter={(time) =>
            timezone === 'local'
              ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date(time).toISOString().substring(11, 16)
          }
          stroke="#666"
          tick={{ fill: '#9ca3af' }}
          allowDataOverflow={true}
        />
        <YAxis
          domain={[0, yAxisMax]}
          stroke="#666"
          tick={{ fill: '#9ca3af' }}
          width={45}
          tickFormatter={(value) => `${value}ms`}
          yAxisId="left"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '0.375rem',
          }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#e5e7eb' }}
          labelFormatter={(label: number) => {
            const dt = new Date(label);
            let year, month, day, hours, minutes, seconds;

            const pad = (num: number) => num.toString().padStart(2, '0');

            if (timezone === 'local') {
              year = dt.getFullYear();
              month = pad(dt.getMonth() + 1);
              day = pad(dt.getDate());
              hours = pad(dt.getHours());
              minutes = pad(dt.getMinutes());
              seconds = pad(dt.getSeconds());
            } else {
              year = dt.getUTCFullYear();
              month = pad(dt.getUTCMonth() + 1);
              day = pad(dt.getUTCDate());
              hours = pad(dt.getUTCHours());
              minutes = pad(dt.getUTCMinutes());
              seconds = pad(dt.getUTCSeconds());
            }

            const timeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            return timezone === 'utc' ? `${timeString} UTC` : timeString;
          }}
          formatter={(
            value: ValueType,
            name: NameType,
            item: Payload<ValueType, NameType>
          ) => {
            const dataPoint = item.payload as FormattedLatencyData | undefined;
            const currentLatency = dataPoint?.latency_ms;

            if (name === 'latency_ms') {
              if (typeof currentLatency === 'number') {
                return [`${currentLatency.toFixed(1)} ms`, 'Latency'];
              } else {
                return ['Unreachable', 'Status'];
              }
            }
            return null;
          }}
        />

        {missingDataSegments.map((segment, index) => (
          <ReferenceArea
            key={`missing-${index}`}
            x1={segment.x1}
            x2={segment.x2}
            yAxisId="left"
            stroke="none"
            fill="#808080" // Grey for missing
            fillOpacity={0.15}
            ifOverflow="visible"
          />
        ))}

        {offlineSegments.map((segment, index) => (
          <ReferenceArea
            key={`offline-${index}`}
            x1={segment.x1}
            x2={segment.x2}
            yAxisId="left"
            stroke="none"
            fill="#ef4444" // Red for offline
            fillOpacity={0.2}
            ifOverflow="visible"
          />
        ))}
        {/* Conditionally render Area and Line if there's data to plot */}
        {chartData.some(p => typeof p.latency_ms === 'number') && (
          <>
            <Area
              type="monotone"
              dataKey="latency_ms"
              stroke="none"
              fill="#3b82f6"
              fillOpacity={0.3}
              connectNulls={false}
              yAxisId="left"
            />
            <Line
              type="monotone"
              dataKey="latency_ms"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              yAxisId="left"
            />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default LatencyChart;