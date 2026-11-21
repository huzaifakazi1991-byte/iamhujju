import type { HTMLAttributes, ReactNode } from 'react';

export function GlassCard({
  children,
  className = '',
  hover = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; hover?: boolean }) {
  return (
    <div className={`glass rounded-[1.25rem] ${hover ? 'card-hover' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-panel ${className}`}>{children}</div>;
}

export function GlassSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-soft rounded-[1.5rem] p-6 sm:p-8 ${className}`}>{children}</div>;
}

export function Sparkline({
  data,
  width = 120,
  height = 34,
  className = '',
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (data.length < 2) {
    return <svg width={width} height={height} aria-hidden className={className} />;
  }
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 3 - (v / max) * (height - 8)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={className}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3ddc84" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3ddc84" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="#1fa864" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill="#3ddc84" />
    </svg>
  );
}
