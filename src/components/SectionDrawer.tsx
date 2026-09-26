import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

export default function SectionDrawer(props: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);

  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-1 py-1 text-left text-sm font-bold text-slate-300"
      >
        <span>
          {props.title} ({props.count})
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && <div className="mt-2 space-y-2">{props.children}</div>}
    </div>
  );
}
