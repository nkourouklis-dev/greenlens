interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

/**
 * The title block at the top of a flow screen. The floating back button
 * (MobileNav) and the status-bar strip above it already reserve the top
 * safe area, so this only sets type and spacing, the same on every screen.
 */
export default function PageHeader({ eyebrow, title, subtitle }: PageHeaderProps) {
  return (
    <header className="mx-auto mb-4 max-w-md pt-2">
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-strong">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-1 text-2xl font-bold leading-tight text-ink">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm leading-5 text-ink-muted">{subtitle}</p>
      )}
    </header>
  );
}
