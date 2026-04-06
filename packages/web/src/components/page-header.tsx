export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
      {description && <p className="text-sm text-text-secondary mt-1">{description}</p>}
    </div>
  );
}
