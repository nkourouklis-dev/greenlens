import type { ProductAnalysisRecord, ScanHistoryItem } from "../types";

export interface ProductRepository { get(productId: string): Promise<ScanHistoryItem | undefined>; }
export interface AnalysisRepository { get(productId: string): Promise<ProductAnalysisRecord | undefined>; save(analysis: ProductAnalysisRecord): Promise<void>; }
export interface HistoryRepository { list(): Promise<ScanHistoryItem[]>; }
export interface ImageRepository { getPreview(productId: string, kind: "ingredients" | "product"): Promise<string | undefined>; }