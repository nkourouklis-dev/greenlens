import type { ScanHistoryItem } from "../types";

const HISTORY_KEY =
  "greenlens.scan-history.v1";

const MAX_STORAGE_IMAGE_SIZE = 800;
const STORAGE_IMAGE_QUALITY = 0.55;

const MAX_OCR_IMAGE_SIZE = 2200;
const OCR_IMAGE_QUALITY = 0.9;

const MAX_HISTORY_ITEMS = 20;

function readHistory(): ScanHistoryItem[] {
  try {
    const storedHistory =
      localStorage.getItem(HISTORY_KEY);

    if (!storedHistory) {
      return [];
    }

    const parsedHistory: unknown =
      JSON.parse(storedHistory);

    return Array.isArray(parsedHistory)
      ? (parsedHistory as ScanHistoryItem[])
      : [];
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

export function getHistoryItem(
  id: string,
): ScanHistoryItem | undefined {
  return readHistory().find(
    (item) => item.id === id,
  );
}

export function saveHistoryItem(
  item: ScanHistoryItem,
): boolean {
  const history = [
    item,
    ...readHistory(),
  ].slice(0, MAX_HISTORY_ITEMS);

  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history),
    );

    return true;
  } catch {
    const trimmed = history
      .slice(0, 5)
      .map((entry, index) =>
        index === 0
          ? entry
          : {
              ...entry,
              ingredientsPhoto: undefined,
              productPhoto: undefined,
            },
      );

    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(trimmed),
      );

      return true;
    } catch {
      return false;
    }
  }
}

export function updateHistoryItem(
  id: string,
  update: Partial<ScanHistoryItem>,
): boolean {
  const history = readHistory();

  const index = history.findIndex(
    (item) => item.id === id,
  );

  if (index < 0) {
    return false;
  }

  history[index] = {
    ...history[index],
    ...update,
  };

  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history),
    );

    return true;
  } catch {
    return false;
  }
}

export function deleteHistoryItem(
  id: string,
): boolean {
  const history = readHistory().filter(
    (item) => item.id !== id,
  );

  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history),
    );

    return true;
  } catch {
    return false;
  }
}

export function clearHistory(): boolean {
  try {
    localStorage.removeItem(HISTORY_KEY);

    return true;
  } catch {
    return false;
  }
}

export function getStorageUsage(): {
  items: number;
  approximateKb: number;
} {
  const stored =
    localStorage.getItem(HISTORY_KEY) ?? "";

  return {
    items: readHistory().length,
    approximateKb: Math.round(
      stored.length / 1024,
    ),
  };
}

export async function compressImageForStorage(
  file: File,
): Promise<string> {
  return resizeImage(
    file,
    MAX_STORAGE_IMAGE_SIZE,
    STORAGE_IMAGE_QUALITY,
  );
}

export async function prepareImageForOcr(
  file: File,
): Promise<string> {
  return resizeImage(
    file,
    MAX_OCR_IMAGE_SIZE,
    OCR_IMAGE_QUALITY,
  );
}

async function resizeImage(
  file: File,
  maximumSize: number,
  quality: number,
): Promise<string> {
  const sourceUrl =
    URL.createObjectURL(file);

  try {
    const image =
      await loadImage(sourceUrl);

    const scale = Math.min(
      1,
      maximumSize /
        Math.max(image.width, image.height),
    );

    const targetWidth = Math.max(
      1,
      Math.round(image.width * scale),
    );

    const targetHeight = Math.max(
      1,
      Math.round(image.height * scale),
    );

    const canvas =
      document.createElement("canvas");

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context =
      canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "Η επεξεργασία της εικόνας δεν είναι διαθέσιμη σε αυτή τη συσκευή.",
      );
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      image,
      0,
      0,
      targetWidth,
      targetHeight,
    );

    return canvas.toDataURL(
      "image/jpeg",
      quality,
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(
  source: string,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () =>
      resolve(image);

    image.onerror = () =>
      reject(
        new Error(
          "Η επιλεγμένη εικόνα δεν μπόρεσε να διαβαστεί.",
        ),
      );

    image.src = source;
  });
}

export function findByBarcode(
  barcode: string,
): ScanHistoryItem | undefined {
  const normalized = barcode.trim();

  if (!normalized) {
    return undefined;
  }

  return getHistory().find(
    (item) =>
      item.barcode === normalized,
  );
}