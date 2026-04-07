"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/format";
import type { ChartComponentData } from "@/agent/dummyResponses";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function ChartComponent({ component }: { component: ChartComponentData }) {
  const chartData = component.labels.map((label, index) => {
    const row: Record<string, string | number> = { label };

    component.datasets.forEach((dataset) => {
      row[dataset.label] = dataset.data[index] ?? 0;
    });

    return row;
  });

  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          {component.chartType === "bar" ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              {component.datasets.map((dataset, index) => (
                <Bar
                  key={dataset.label}
                  dataKey={dataset.label}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          ) : component.chartType === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              {component.datasets.map((dataset, index) => (
                <Line
                  key={dataset.label}
                  type="monotone"
                  dataKey={dataset.label}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2.5}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={chartData.map((row) => ({
                  name: String(row.label),
                  value: Number(row[component.datasets[0]?.label ?? ""] ?? 0),
                }))}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={84}
                paddingAngle={2}
              >
                {chartData.map((row, index) => (
                  <Cell
                    key={`${row.label}-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {component.datasets.map((dataset, index) => (
          <div
            key={dataset.label}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
            {dataset.label}
          </div>
        ))}
      </div>
    </div>
  );
}
