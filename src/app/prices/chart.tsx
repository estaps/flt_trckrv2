// Server-rendered SVG price charts.

interface Point {
  t: Date;
  price: number;
}

function scale(points: Point[], width: number, height: number, pad: number, lines: number[] = [], padLeft = pad) {
  const prices = [...points.map((p) => p.price), ...lines];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const t0 = points[0].t.getTime();
  const tSpan = points[points.length - 1].t.getTime() - t0 || 1;
  return {
    x: (t: Date) => padLeft + ((t.getTime() - t0) / tSpan) * (width - pad - padLeft),
    y: (price: number) => height - pad - ((price - min) / span) * (height - 2 * pad),
    min,
    max,
  };
}

export function Sparkline({ points }: { points: Point[] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 28;
  const s = scale(points, w, h, 3);
  const d = points.map((p, i) => `${i ? "L" : "M"}${s.x(p.t).toFixed(1)},${s.y(p.price).toFixed(1)}`).join("");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

export function PriceChart({
  points,
  currency,
  paid,
  target,
}: {
  points: Point[];
  currency: string;
  paid?: number | null;
  target?: number | null;
}) {
  if (points.length === 0) return <p className="muted">No prices yet.</p>;
  const w = 640;
  const h = 220;
  const pad = 28;
  const lines = [paid, target].filter((v): v is number => v != null);
  const pts = points.length === 1 ? [points[0], { ...points[0], t: new Date(points[0].t.getTime() + 1) }] : points;
  const padLeft = 60;
  const s = scale(pts, w, h, pad, lines, padLeft);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${s.x(p.t).toFixed(1)},${s.y(p.price).toFixed(1)}`).join("");
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const ref = (value: number | null | undefined, label: string, dash: string) =>
    value == null ? null : (
      <g>
        <line x1={padLeft} x2={w - pad} y1={s.y(value)} y2={s.y(value)} stroke="var(--muted)" strokeDasharray={dash} />
        <text x={w - pad} y={s.y(value) - 4} textAnchor="end" fontSize="11" fill="var(--muted)">
          {label} {fmt(value)}
        </text>
      </g>
    );
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Price history">
      <text x={4} y={s.y(s.max) + 4} fontSize="11" fill="var(--muted)">{fmt(s.max)}</text>
      <text x={4} y={s.y(s.min) + 4} fontSize="11" fill="var(--muted)">{fmt(s.min)}</text>
      {ref(paid, "Paid", "4 3")}
      {ref(target, "Target", "1 3")}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {points.map((p) => (
        <circle key={p.t.toISOString()} cx={s.x(p.t)} cy={s.y(p.price)} r="2.5" fill="var(--accent)">
          <title>{`${fmt(p.price)} on ${p.t.toISOString().slice(0, 16).replace("T", " ")} UTC`}</title>
        </circle>
      ))}
    </svg>
  );
}
