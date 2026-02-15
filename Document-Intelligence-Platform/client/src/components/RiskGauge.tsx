import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

interface RiskGaugeProps {
  score: number;
}

export function RiskGauge({ score }: RiskGaugeProps) {
  // Data for the semi-circle gauge
  const data = [
    { name: "Score", value: score },
    { name: "Remainder", value: 100 - score },
  ];

  // Color logic
  const getColor = (value: number) => {
    if (value > 75) return "hsl(0 84.2% 60.2%)"; // Destructive/Red
    if (value > 40) return "hsl(38 92% 50%)";    // Warning/Yellow
    return "hsl(142 76% 36%)";                   // Success/Green
  };

  const activeColor = getColor(score);

  return (
    <div className="relative h-40 w-full flex flex-col items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={0}
            dataKey="value"
          >
            <Cell key="score" fill={activeColor} cornerRadius={6} />
            <Cell key="remainder" fill="#e2e8f0" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      
      {/* Centered Score Text - positioned absolutely to sit inside the arch */}
      <div className="absolute bottom-0 flex flex-col items-center justify-center pb-2">
        <span className="text-4xl font-bold font-display" style={{ color: activeColor }}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
          Risk Score
        </span>
      </div>
    </div>
  );
}
