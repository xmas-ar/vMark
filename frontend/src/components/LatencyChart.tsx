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
import { generateOfflineSegments } from '../utils/chartUtils';

interface LatencyChartProps {
  chartData: FormattedLatencyData[];
  timeRange: 2 | 6 | 12 | 24;
  timezone: 'local' | 'utc';
  nodeId: string;
}

const LatencyChart: React.FC<LatencyChartProps> = ({
  chartData,
  timezone,
  nodeId
}) => {
  const {
    yAxisMax,
    offlineSegments
  } = useMemo(() => {
    const validLatencyPoints = chartData.filter(point => typeof point.latency === 'number');
    const maxLatency = validLatencyPoints.reduce((max, point) => {
      const latencyValue = typeof point.latency === 'number' ? point.latency : 0;
      return Math.max(max, latencyValue);
    }, 0);
    const yAxisMax = Math.max(16, Math.ceil(maxLatency * 1.1));
    const offlineSegments = generateOfflineSegments(chartData);
    console.log('[Debug] Y Axis Max:', yAxisMax);
    console.log('[Debug] Offline Segments:', offlineSegments);
    return { yAxisMax, offlineSegments };
  }, [chartData]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">No latency data points available.</p>
      </div>
    );
  }
  const hasValidData = chartData.some(point => typeof point.latency === 'number');
  if (!hasValidData && offlineSegments.length === 0) {
     return (
       <div className="flex items-center justify-center h-full">
         <p className="text-gray-400">No valid latency measurements in this period.</p>
       </div>
     );
  }


  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(time) =>
            timezone === 'local'
              ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date(time).toISOString().substring(11, 16)
          }
          stroke="#666"
          tick={{ fill: '#9ca3af' }}
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

            // Helper to pad numbers with leading zero if needed
            const pad = (num: number) => num.toString().padStart(2, '0');

            if (timezone === 'local') {
              year = dt.getFullYear();
              month = pad(dt.getMonth() + 1); // Month is 0-indexed
              day = pad(dt.getDate());
              hours = pad(dt.getHours());
              minutes = pad(dt.getMinutes());
              seconds = pad(dt.getSeconds());
            } else { // timezone === 'utc'
              year = dt.getUTCFullYear();
              month = pad(dt.getUTCMonth() + 1); // Month is 0-indexed
              day = pad(dt.getUTCDate());
              hours = pad(dt.getUTCHours());
              minutes = pad(dt.getUTCMinutes());
              seconds = pad(dt.getUTCSeconds());
            }

            // Construct the consistent format YYYY-MM-DD HH:MM:SS
            // Optionally add ' UTC' suffix if timezone is 'utc' for clarity
            const timeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            return timezone === 'utc' ? `${timeString} UTC` : timeString;
          }}
          formatter={(
            value: ValueType,
            name: NameType,
            item: Payload<ValueType, NameType>
          ) => {
            // Access the original data point directly from the item's payload property
            const dataPoint = item.payload as FormattedLatencyData | undefined;
            const currentLatency = dataPoint?.latency;

            // Check the 'name' which corresponds to the dataKey ('latency')
            if (name === 'latency') {
              if (typeof currentLatency === 'number') {
                // When online, return the formatted latency value and the label 'Latency'
                return [`${currentLatency.toFixed(1)} ms`, 'Latency'];
              } else {
                // When offline (latency is null or undefined in the dataPoint)
                return ['Unreachable', 'Status'];
              }
            }
            // Hide any other potential data keys from the tooltip
            return null;
          }}
        />

        {offlineSegments.map((segment, index) => (
          <ReferenceArea
            key={`offline-${index}`}
            x1={segment.x1}
            x2={segment.x2}
            yAxisId="left"
            stroke="none"
            fill="#ef4444"
            fillOpacity={0.2}
            ifOverflow="visible"
          />
        ))}

        <Area
          type="monotone"
          dataKey="latency"
          stroke="none"
          fill="#3b82f6"
          fillOpacity={0.3}
          connectNulls={false}
          yAxisId="left"
        />
        <Line
          type="monotone"
          dataKey="latency"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          yAxisId="left"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default LatencyChart;