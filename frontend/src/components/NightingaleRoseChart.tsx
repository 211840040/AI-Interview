import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface RoseDataItem {
  subject: string;
  score: number;
  fullMark: number;
  color: string;
}

interface NightingaleRoseChartProps {
  data: RoseDataItem[];
  height?: number;
  width?: number;
  className?: string;
}

const INNER_COLORS = ['#7c3aed', '#2563eb', '#059669', '#0891b2', '#ea580c'];

const LIGHT_COLORS: Record<string, string> = {
  '#7c3aed': '#c4b5fd',
  '#2563eb': '#93c5fd',
  '#059669': '#6ee7b7',
  '#0891b2': '#67e8f9',
  '#ea580c': '#fdba74',
};

const RADIAN = Math.PI / 180;

const renderLabel = (props: any) => {
  const { cx, cy, midAngle, payload } = props;
  if (!payload || !payload.isOuter) return null;
  if (payload.color === '#f1f5f9') return null;

  const radius = 175;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  const isLeft = midAngle > 90 && midAngle < 270;

  return (
    <text
      x={x} y={y}
      textAnchor={isLeft ? 'end' : 'start'}
      dominantBaseline="middle"
      fill="#475569"
      fontSize={12}
      fontWeight={600}
    >
      {payload.name} {payload.pct}%
    </text>
  );
};

export default function NightingaleRoseChart({ data, height = 450, className = '' }: NightingaleRoseChartProps) {
  const { innerRing, outerRing } = useMemo(() => {
    if (!data || data.length === 0) return { innerRing: [], outerRing: [] };

    const totalFullMark = data.reduce((sum, d) => sum + d.fullMark, 0);

    const inner = data.map((item, i) => ({
      name: item.subject,
      value: item.fullMark,
      color: item.color || INNER_COLORS[i % INNER_COLORS.length],
      pct: Math.round((item.fullMark / totalFullMark) * 100),
    }));

    const outer = data.flatMap((item, i) => {
      const parentColor = item.color || INNER_COLORS[i % INNER_COLORS.length];
      const lightColor = LIGHT_COLORS[parentColor] || '#ddd6fe';
      const remaining = item.fullMark - item.score;
      const pct = Math.round((item.score / item.fullMark) * 100);
      return [
        {
          name: item.subject,
          value: item.score,
          isOuter: true,
          color: lightColor,
          pct,
        },
        {
          name: item.subject,
          value: remaining > 0 ? remaining : 0,
          isOuter: true,
          color: '#f1f5f9',
          pct: 100 - pct,
        },
      ];
    });

    return { innerRing: inner, outerRing: outer };
  }, [data]);

  if (!innerRing.length) return null;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* 内圈 — 维度，圆弧长度反映权重 */}
          <Pie
            data={innerRing}
            dataKey="value"
            nameKey="name"
            cx="50%" cy="50%"
            innerRadius={45}
            outerRadius={100}
            paddingAngle={2}
            cornerRadius={6}
            stroke="none"
          >
            {innerRing.map((entry, i) => (
              <Cell key={`inner-${i}`} fill={entry.color} />
            ))}
          </Pie>

          {/* 外圈 — 得分段(浅色) + 剩余段(灰色) */}
          <Pie
            data={outerRing}
            dataKey="value"
            nameKey="name"
            cx="50%" cy="50%"
            innerRadius={103}
            outerRadius={150}
            paddingAngle={1}
            cornerRadius={4}
            stroke="none"
            label={renderLabel}
            labelLine={false}
          >
            {outerRing.map((entry, i) => (
              <Cell key={`outer-${i}`} fill={entry.color} />
            ))}
          </Pie>

          {/* 中心文字 */}
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
            fill="#64748b" fontSize={16} fontWeight={600}>
            多维度
          </text>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
