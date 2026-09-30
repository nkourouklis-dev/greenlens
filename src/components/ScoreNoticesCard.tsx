import { AlertTriangle, Camera } from "lucide-react";
import type { ScoreNotice } from "../types";

/** Notices that mean part of the label was not used, so a photo would help. */
const MISSING_SOURCE_CODES = new Set([
  "nutrition_not_considered",
  "ingredients_not_considered",
  "partial_no_nutrition",
  "partial_no_ingredients",
]);

function hasMissingSourceNotice(
  notices: ScoreNotice[] | undefined,
): boolean {
  return (notices ?? []).some((notice) =>
    MISSING_SOURCE_CODES.has(notice.code),
  );
}

/**
 * What the number alone cannot say, shown right under the score: that the
 * drink contains alcohol (and moderation guidance applies whatever it
 * scored), or that the nutrition table / ingredient list was left out
 * because it could not be read — with a way to add that photo.
 */
export default function ScoreNoticesCard(props: {
  notices: ScoreNotice[] | undefined;
  onAddPhoto?: () => void;
  /** Recompute from the text already on file; shown beside the photo button. */
  onRescore?: () => void;
  isRescoring?: boolean;
}) {
  const notices = props.notices ?? [];

  if (notices.length === 0) {
    return null;
  }

  // Which half is missing decides what the button asks for — "add the
  // missing photo" does not say which side of the pack to turn over to.
  const photoLabel = notices.some((notice) =>
    ["nutrition_not_considered", "partial_no_nutrition"].includes(notice.code),
  )
    ? "τον διατροφικό πίνακα"
    : notices.some((notice) =>
          ["ingredients_not_considered", "partial_no_ingredients"].includes(
            notice.code,
          ),
        )
      ? "τα συστατικά"
      : null;

  const offerPhoto =
    props.onAddPhoto !== undefined && hasMissingSourceNotice(notices);

  return (
    <section className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
      {notices.map((notice) => (
        <div key={notice.code} className="flex items-start gap-2">
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0 text-amber-300"
          />

          <div className="min-w-0">
            <h2 className="text-sm font-bold text-amber-100">
              {notice.title}
            </h2>

            <p className="mt-1 text-sm leading-6 text-amber-50">
              {notice.body}
            </p>
          </div>
        </div>
      ))}

      {offerPhoto && (
        <button
          type="button"
          onClick={props.onAddPhoto}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/60 px-3 py-2 text-center text-sm font-bold leading-5 text-amber-50"
        >
          <Camera size={16} className="shrink-0" />
          <span>
            {photoLabel
              ? `Φωτογράφισε ${photoLabel}`
              : "Πρόσθεσε φωτογραφία που λείπει"}
          </span>
        </button>
      )}

      {offerPhoto && props.onRescore && (
        <button
          type="button"
          onClick={props.onRescore}
          disabled={props.isRescoring}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-sm font-semibold leading-5 text-amber-100 disabled:opacity-60"
        >
          {props.isRescoring
            ? "Επανυπολογισμός..."
            : "Επανυπολογισμός βαθμολογίας"}
        </button>
      )}
    </section>
  );
}
