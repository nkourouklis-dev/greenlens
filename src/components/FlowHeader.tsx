import type { ReactNode } from "react";

interface FlowHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Progress dots, same look as the camera screens' top bar. */
  step?: { current: number; total: number };
  children?: ReactNode;
}

/**
 * The dark green title card at the top of a flow screen (after the camera
 * steps): same visual language as the home hero. A rounded card, not an
 * edge-to-edge band, because the floating back button (MobileNav) and the
 * status-bar strip already occupy the very top of the page.
 *
 * Light-on-dark colours are hex on purpose: the theme remaps emerald-100..400
 * to dark shades for the light UI, which would vanish on this background.
 */
export default function FlowHeader({
  eyebrow,
  title,
  subtitle,
  step,
  children,
}: FlowHeaderProps) {
  return (
    <header className="relative mx-auto mb-5 max-w-md overflow-hidden rounded-3xl bg-gradient-to-br from-[#052e22] via-[#064e3b] to-[#0b7a52] px-5 py-5 text-white shadow-lg shadow-emerald-900/20">
      <div
        aria-hidden
        className="gl-drift pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#34d399]/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a7f3d0]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight">
          {title}
          <span className="text-[#6ee7b7]">.</span>
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-5 text-emerald-50/75">{subtitle}</p>
        )}

        {step && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: step.total }, (_, index) => (
                <span
                  key={index}
                  className={`h-1.5 w-8 rounded-full ${
                    index < step.current ? "bg-[#6ee7b7]" : "bg-white/25"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs font-semibold text-emerald-50/80">
              Βήμα {step.current} από {step.total}
            </p>
          </div>
        )}

        {children}
      </div>
    </header>
  );
}
