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
}) {
  const notices = props.notices ?? [];

  if (notices.length === 0) {
    return null;
  }

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
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/60 text-sm font-bold text-amber-50"
        >
          <Camera size={16} />
          Πρόσθεσε φωτογραφία που λείπει
        </button>
      )}
    </section>
  );
}
