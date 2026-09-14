import { useCallback, useRef } from "react";

/**
 * Picking a photo from the device instead of shooting one live.
 *
 * Every capture surface in the app was built around a live camera viewport,
 * which is the right default in a store with a phone in hand and no use at
 * all on a desktop without a webcam — the same admin work done at a desk
 * had no way in. This gives each of those surfaces a second way to produce
 * the exact same `File` the camera path produces, so nothing downstream
 * (compression, OCR, upload) can tell the two apart.
 *
 * Deliberately no `capture` attribute on the input: `capture="environment"`
 * forces a phone straight into its camera and hides the gallery, which is
 * the opposite of what a file picker is for. Without it the OS offers both,
 * so the same control means "camera or gallery" on a phone and "browse
 * files" on a computer, without this code having to guess which it is on.
 */
export function usePhotoFilePicker(onFile: (file: File) => void): {
  /** Opens the OS picker. */
  open: () => void;
  /** Must be rendered somewhere for `open` to work. */
  input: React.ReactElement;
} {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const open = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];

        // Cleared before the handler runs so picking the same file twice in
        // a row still fires a change event.
        event.target.value = "";

        if (file) {
          onFile(file);
        }
      }}
    />
  );

  return { open, input };
}
