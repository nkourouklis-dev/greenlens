export type ScanStatus = "known" | "unknown";

export interface Product {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  ingredients: string[];
  description: string;
  isDemo: boolean;
}

export interface ScanHistoryItem {
  id: string;
  barcode: string;
  status: ScanStatus;
  scannedAt: string;
  productId?: string;
  productName?: string;
  ingredientsPhoto?: string;
  productPhoto?: string;
}