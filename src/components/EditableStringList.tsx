import { useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * Add/remove/edit chip-style list editor — shared by every plain
 * string-array field in the analysis-result edit form (positives,
 * attentionItems, potentialAllergens, executiveSummary.highlights,
 * executiveSummary.watchOutFor) so that behaviour isn't rebuilt five
 * times.
 */
export default function EditableStringList(props: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function addValue() {
    const trimmed = draft.trim();

    if (!trimmed) {
      return;
    }

    props.onChange([...props.values, trimmed]);
    setDraft("");
  }

  function updateValue(index: number, value: string) {
    const next = [...props.values];
    next[index] = value;
    props.onChange(next);
  }

  function removeValue(index: number) {
    props.onChange(
      props.values.filter((_, valueIndex) => valueIndex !== index),
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {props.label}
      </p>

      <div className="mt-2 space-y-2">
        {props.values.map((value, index) => (
          <div
            key={index}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={value}
              onChange={(event) =>
                updateValue(index, event.target.value)
              }
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />

            <button
              type="button"
              onClick={() => removeValue(index)}
              aria-label="Αφαίρεση"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-red-400"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue();
            }
          }}
          placeholder={props.placeholder ?? "Προσθήκη..."}
          className="h-11 min-w-0 flex-1 rounded-xl border border-dashed border-line bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-ink-faintest focus:border-accent focus:ring-2 focus:ring-accent/20"
        />

        <button
          type="button"
          onClick={addValue}
          disabled={!draft.trim()}
          aria-label="Προσθήκη"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted disabled:cursor-not-allowed disabled:text-ink-faintest"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
