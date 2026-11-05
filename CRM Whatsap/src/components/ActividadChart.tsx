"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export default function ActividadChart({ data }: { data: { dia: string; cantidad: number }[] }) {
  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 6, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#42d6d0" stopOpacity={0.16} />
              <stop offset="100%" stopColor="#42d6d0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--linea)" vertical={false} />
          <XAxis dataKey="dia" tick={{ fontSize: 10.5, fill: "var(--tinta-3)" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10.5, fill: "var(--tinta-3)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            cursor={{ stroke: "var(--linea-fuerte)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--card-3)",
              border: "1px solid var(--linea-fuerte)",
              borderRadius: 7,
              fontSize: 11.5,
              color: "var(--tinta)",
              padding: "6px 9px",
            }}
            labelStyle={{ color: "var(--tinta-3)", fontSize: 10.5, marginBottom: 2 }}
            formatter={(v: number) => [`${v} leads`, ""]}
          />
          <Area
            type="monotone"
            dataKey="cantidad"
            stroke="#42d6d0"
            strokeWidth={1.75}
            fill="url(#grad)"
            dot={false}
            activeDot={{ r: 3.5, fill: "#42d6d0", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
