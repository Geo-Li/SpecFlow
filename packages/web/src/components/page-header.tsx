export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-[22px] font-semibold text-text-primary tracking-tight">{title}</h1>
      {description && <p className="text-sm text-text-tertiary mt-1">{description}</p>}
    </div>
  );
}
