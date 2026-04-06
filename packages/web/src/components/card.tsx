export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-surface rounded-lg border border-border shadow-sm p-6 ${className}`}>{children}</div>;
}
