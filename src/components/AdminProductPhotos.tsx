import { useRef, useState } from "react";
import { Camera, RotateCcw, Trash2 } from "lucide-react";
import AdminPhotoThumbnail from "./AdminPhotoThumbnail";
import { uploadAdminPhoto, type PhotoType } from "../services/adminClient";
import {
  deleteAdminPhoto,
  type AdminProductPhoto,
} from "../services/adminProductsClient";

/**
 * The same three named shots the in-store capture flow asks for
 * (AdminCapture.tsx), in the same order — a barcode that was photographed
 * there and one filled in from here should end up with the same slots
 * rather than two parallel vocabularies.
 */
const PHOTO_SLOTS: Array<{ type: PhotoType; label: string }> = [
  { type: "front", label: "Μπροστινή ετικέτα" },
  { type: "ingredients", label: "Συστατικά" },
  { type: "nutrition", label: "Διατροφικός πίνακας" },
];

/**
 * Photos arrive newest-first (adminProducts.ts orders by uploaded_at DESC),
 * so the first row of a type is the current one. Older shots of the same
 * type are kept rather than replaced — a retake writes a new timestamped R2
 * key — which is why this picks rather than expecting one row per type.
 */
function currentPhoto(
  photos: AdminProductPhoto[],
  type: PhotoType,
): AdminProductPhoto | undefined {
  return photos.find((photo) => photo.photoType === type);
}

/**
 * Per-barcode photo slots on the PIM detail screen.
 *
 * Adding photos used to live only in the capture flow, which meant leaving
 * the product you were editing, re-entering its barcode, and coming back —
 * and gave no indication of which of the three shots a row was still
 * missing. Uploads go through the same endpoint the capture flow uses, so a
 * photo added here is indistinguishable from one taken in store.
 *
 * A plain file input, which is why this screen doesn't carry the
 * live-viewport machinery AdminCapture needs: the OS picker it opens is
 * already the right control on both devices — "camera or photo library" on
 * a phone, "browse files" on a computer.
 *
 * It used to carry `capture="environment"`, which sends a phone straight
 * into its camera and hides the library entirely. That made a photo already
 * on the phone — or one shot earlier and edited — impossible to attach, and
 * bought nothing on desktop, where the attribute is ignored anyway.
 */
export default function AdminProductPhotos(props: {
  barcode: string;
  photos: AdminProductPhoto[];
  onUploaded: () => void;
  onOpen: (r2Key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef<PhotoType | null>(null);

  const [uploadingSlot, setUploadingSlot] =
    useState<PhotoType | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Confirmed before it happens, never undone after: the object is gone
  // from R2 and the row from D1, and there is no bin to fish it back out
  // of. The label goes in the prompt so "Διαγραφή;" on the wrong row is
  // visibly the wrong row.
  async function removePhoto(
    photo: AdminProductPhoto,
    label: string,
  ) {
    if (deletingId !== null) {
      return;
    }

    if (
      !window.confirm(
        `Να διαγραφεί οριστικά η φωτογραφία «${label}»;`,
      )
    ) {
      return;
    }

    setDeletingId(photo.id);
    setUploadError("");

    try {
      await deleteAdminPhoto(props.barcode, photo.id);
      props.onUploaded();
    } catch (caughtError) {
      setUploadError(
        caughtError instanceof Error
          ? caughtError.message
          : "Η διαγραφή απέτυχε.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function pickFor(type: PhotoType) {
    if (uploadingSlot) {
      return;
    }

    pendingSlot.current = type;
    inputRef.current?.click();
  }

  async function handleFile(file: File) {
    const slot = pendingSlot.current;

    if (!slot) {
      return;
    }

    setUploadingSlot(slot);
    setUploadError("");

    try {
      await uploadAdminPhoto(props.barcode, slot, file);
      props.onUploaded();
    } catch (caughtError) {
      setUploadError(
        caughtError instanceof Error
          ? caughtError.message
          : "Η μεταφόρτωση απέτυχε.",
      );
    } finally {
      setUploadingSlot(null);
      pendingSlot.current = null;
    }
  }

  const otherPhotos = props.photos.filter(
    (photo) =>
      !PHOTO_SLOTS.some((slot) => slot.type === photo.photoType),
  );

  return (
    <section className="mt-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Φωτογραφίες
      </h2>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          // Cleared before awaiting so picking the same file twice in a row
          // still fires a change event.
          event.target.value = "";

          if (file) {
            void handleFile(file);
          }
        }}
      />

      <div className="mt-2 space-y-3">
        {PHOTO_SLOTS.map((slot) => {
          const photo = currentPhoto(props.photos, slot.type);
          const isUploading = uploadingSlot === slot.type;

          return (
            <div
              key={slot.type}
              className="flex items-center gap-3 rounded-2xl border border-line-subtle bg-surface/70 p-3"
            >
              {photo ? (
                <AdminPhotoThumbnail
                  r2Key={photo.r2Key}
                  alt={slot.label}
                  className="h-20 w-20 rounded-xl object-cover"
                  onClick={() => props.onOpen(photo.r2Key)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => pickFor(slot.type)}
                  aria-label={`Προσθήκη: ${slot.label}`}
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas text-ink-faint active:scale-95"
                >
                  <Camera size={28} />
                </button>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-ink">
                  {slot.label}
                </p>

                <p className="mt-0.5 text-xs text-ink-faint">
                  {isUploading
                    ? "Μεταφόρτωση..."
                    : photo
                      ? "Καταχωρημένη"
                      : "Λείπει"}
                </p>
              </div>

              {photo && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => pickFor(slot.type)}
                    disabled={isUploading}
                    aria-label={`Νέα λήψη: ${slot.label}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-muted active:scale-95 disabled:opacity-50"
                  >
                    <RotateCcw size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => void removePhoto(photo, slot.label)}
                    disabled={isUploading || deletingId === photo.id}
                    aria-label={`Διαγραφή: ${slot.label}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-red-400 active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {uploadError && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm leading-5 text-red-100"
        >
          {uploadError}
        </p>
      )}

      {otherPhotos.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-ink-faint">
            Άλλες φωτογραφίες
          </p>

          <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
            {otherPhotos.map((photo) => (
              <div key={photo.id} className="relative shrink-0">
                <AdminPhotoThumbnail
                  r2Key={photo.r2Key}
                  alt={photo.photoType}
                  className="h-20 w-20 rounded-xl object-cover"
                  onClick={() => props.onOpen(photo.r2Key)}
                />

                <button
                  type="button"
                  onClick={() => void removePhoto(photo, photo.photoType)}
                  disabled={deletingId === photo.id}
                  aria-label={`Διαγραφή: ${photo.photoType}`}
                  className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-canvas text-red-400 active:scale-95 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
