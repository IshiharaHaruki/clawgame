import { useEffect, useRef } from 'react';

interface TokenData {
  agentId: string;
  agentName: string;
  inputTokens: number;
  outputTokens: number;
}

interface TokenChartProps {
  data: TokenData[];
}

const AGENT_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

export function TokenChart({ data }: TokenChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    const maxTokens = Math.max(...data.map(d => d.inputTokens + d.outputTokens), 1);
    const barWidth = Math.min(40, (width - 20) / data.length - 4);
    const chartHeight = height - 30;

    data.forEach((d, i) => {
      const x = 10 + i * (barWidth + 4);
      const total = d.inputTokens + d.outputTokens;
      const barHeight = (total / maxTokens) * chartHeight;
      const color = AGENT_COLORS[i % AGENT_COLORS.length];

      // Input bar (bottom)
      const inputHeight = (d.inputTokens / maxTokens) * chartHeight;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x, chartHeight - barHeight, barWidth, inputHeight);

      // Output bar (top)
      ctx.globalAlpha = 1;
      ctx.fillRect(x, chartHeight - barHeight + inputHeight, barWidth, barHeight - inputHeight);

      // Label
      ctx.fillStyle = '#bdc3c7';
      ctx.globalAlpha = 1;
      ctx.font = '5px "Press Start 2P"';
      ctx.textAlign = 'center';
      const label = d.agentName.length > 6 ? d.agentName.slice(0, 5) + '\u2026' : d.agentName;
      ctx.fillText(label, x + barWidth / 2, height - 2);
    });
  }, [data]);

  if (data.length === 0) {
    return <div className="activity-empty">No usage data available.</div>;
  }

  return (
    <canvas
      ref={canvasRef}
      className="token-chart"
      style={{ width: '100%', height: '100px' }}
    />
  );
}
