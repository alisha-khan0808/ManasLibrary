'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/lib/format';

interface TrendPoint {
  day: string;
  collection: string;
  attendance: number;
  admissions: number;
}

/**
 * Two series with different units share one chart, so collection gets its own
 * right-hand axis rather than being squashed against attendance counts.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const points = data.map((point) => ({
    day: point.day.slice(5),
    collection: Number.parseFloat(point.collection),
    attendance: point.attendance,
    admissions: point.admissions,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="collectionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgb(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: 'rgb(var(--content-subtle))' }}
            tickLine={false}
            axisLine={{ stroke: 'rgb(var(--border))' }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: 'rgb(var(--content-subtle))' }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
            }
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: 'rgb(var(--content-subtle))' }}
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'rgb(var(--surface-raised))',
              border: '1px solid rgb(var(--border))',
              borderRadius: '0.5rem',
              fontSize: '12px',
              color: 'rgb(var(--content))',
            }}
            formatter={(value: number, name: string) =>
              name === 'Collection' ? formatMoney(value) : value
            }
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: 'rgb(var(--content-muted))' }}
            iconType="plainline"
          />

          <Area
            yAxisId="left"
            type="monotone"
            dataKey="collection"
            name="Collection"
            stroke="rgb(var(--brand))"
            strokeWidth={2}
            fill="url(#collectionFill)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="attendance"
            name="Attendance"
            stroke="rgb(var(--positive))"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="admissions"
            name="Admissions"
            stroke="rgb(var(--warning))"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
