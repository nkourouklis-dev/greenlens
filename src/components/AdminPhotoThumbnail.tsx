import { ImageOff } from "lucide-react";
import { useAdminPhotoUrl } from "../hooks/useAdminPhotoUrl";

export default function AdminPhotoThumbnail(props: {
  r2Key: string | null;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const url = useAdminPhotoUrl(props.r2Key);
  const className =
    props.className ??
    "h-16 w-16 rounded-xl object-cover";

  if (!props.r2Key || !url) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-muted text-ink-faint ${className}`}
      >
        <ImageOff size={20} />
      </div>
    );
  }

  const image = (
    <img src={url} alt={props.alt} className={className} />
  );

  if (!props.onClick) {
    return image;
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      className="shrink-0"
    >
      {image}
    </button>
  );
}
