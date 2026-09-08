import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import AdminGate from "../components/AdminGate";
import AdminPhotoThumbnail from "../components/AdminPhotoThumbnail";
import {
  listAdminProducts,
  type AdminProductListItem,
} from "../services/adminProductsClient";

interface StatusOption {
  value: string | undefined;
  label: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: undefined, label: "Όλα" },
  { value: "draft", label: "Draft" },
  { value: "ai_generated", label: "AI" },
  { value: "verified", label: "Verified" },
  { value: "needs_review", label: "Needs review" },
];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-300",
  ai_generated: "bg-blue-500/15 text-blue-300",
  verified: "bg-emerald-500/15 text-emerald-300",
  needs_review: "bg-amber-500/15 text-amber-300",
};

function statusLabel(status: string): string {
  return (
    STATUS_OPTIONS.find((option) => option.value === status)
      ?.label ?? status
  );
}

function AdminProductsContent() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<string | undefined>(
    undefined,
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AdminProductListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(24);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Debounce the barcode search box before it drives a request.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError("");

    listAdminProducts({ status, search, page })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setItems(result.items);
        setTotalCount(result.totalCount);
        setPageSize(result.pageSize);
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }

        setLoadError(
          caughtError instanceof Error
            ? caughtError.message
            : "Η λίστα προϊόντων δεν φορτώθηκε.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, search, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <main className="min-h-screen bg-canvas px-4 pb-28 pt-5 text-ink">
      <section className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Προϊόντα</h1>

          <button
            type="button"
            onClick={() => navigate("/admin/capture")}
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
          >
            <Camera size={16} />
            Λήψη
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => {
                setStatus(option.value);
                setPage(1);
              }}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                status === option.value
                  ? "bg-accent text-on-accent"
                  : "border border-line bg-surface text-ink-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          inputMode="numeric"
          value={searchInput}
          onChange={(event) =>
            setSearchInput(event.target.value)
          }
          placeholder="Αναζήτηση barcode..."
          className="mt-3 h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-ink-faintest focus:border-accent focus:ring-2 focus:ring-accent/20"
        />

        {loadError && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm leading-5 text-red-100"
          >
            {loadError}
          </p>
        )}

        {isLoading ? (
          <p className="mt-6 text-sm text-ink-faint">
            Φόρτωση...
          </p>
        ) : items.length === 0 ? (
          <p className="mt-6 text-sm text-ink-faint">
            Δεν βρέθηκαν προϊόντα.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.barcode}
                type="button"
                onClick={() =>
                  navigate(
                    `/admin/products/${encodeURIComponent(item.barcode)}`,
                  )
                }
                className="flex flex-col items-start gap-2 rounded-2xl border border-line-subtle bg-surface/70 p-3 text-left active:scale-[0.98]"
              >
                <AdminPhotoThumbnail
                  r2Key={item.thumbnailR2Key}
                  alt={item.barcode}
                  className="h-24 w-full rounded-xl object-cover"
                />

                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[item.status] ?? "bg-surface-muted text-ink-faint"}`}
                >
                  {statusLabel(item.status)}
                </span>

                <p className="w-full truncate font-mono text-sm font-bold text-ink">
                  {item.barcode}
                </p>

                <p className="text-xs text-ink-faint">
                  {item.category ?? "—"} · {item.scanCount}{" "}
                  σαρώσεις
                </p>
              </button>
            ))}
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
              disabled={page <= 1}
              className="flex h-11 items-center gap-1 rounded-xl border border-line px-4 text-sm font-semibold text-ink-muted disabled:cursor-not-allowed disabled:text-ink-faintest"
            >
              <ChevronLeft size={16} />
              Προηγούμενη
            </button>

            <p className="text-sm text-ink-faint">
              Σελίδα {page} από {totalPages}
            </p>

            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1),
                )
              }
              disabled={page >= totalPages}
              className="flex h-11 items-center gap-1 rounded-xl border border-line px-4 text-sm font-semibold text-ink-muted disabled:cursor-not-allowed disabled:text-ink-faintest"
            >
              Επόμενη
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default function AdminProducts() {
  return (
    <AdminGate>
      <AdminProductsContent />
    </AdminGate>
  );
}
