import type { ScanHistoryItem } from "../types";

const HISTORY_KEY = "greenlens.scan-history.v1";
const MAX_IMAGE_SIZE = 1_280;

function readHistory(): ScanHistoryItem[] {
  try {
    const storedHistory = localStorage.getItem(HISTORY_KEY);
    if (!storedHistory) return [];

    const parsedHistory: unknown = JSON.parse(storedHistory);
    return Array.isArray(parsedHistory) ? (parsedHistory as ScanHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function getHistory(): ScanHistoryItem[] {
  return readHistory().sort(
    (firstItem, secondItem) =>
      new Date(secondItem.scannedAt).getTime() -
      new Date(firstItem.scannedAt).getTime(),
  );
}

export function getHistoryItem(id: string): ScanHistoryItem | undefined {
  return readHistory().find((item) => item.id === id);
}

export function saveHistoryItem(item: ScanHistoryItem): boolean {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([item, ...readHistory()]));
    return true;
  } catch {
    return false;
  }
}

export async function compressImageForStorage(file: File): Promise<string> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression is unavailable.");

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be read."));
    image.src = source;
  });
}

export function updateHistoryItem(id: string, update: Partial<ScanHistoryItem>): boolean {
  const history = readHistory();
  const index = history.findIndex((item) => item.id === id);
  if (index < 0) return false;
  history[index] = { ...history[index], ...update };
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); return true; } catch { return false; }
}