export interface PhotoInfo {
  originalUrl: string;
  filename: string;
  currentUrl: string;
  processed: boolean;
  actions: string[];
  isProbablyBarbara: boolean;
  description: string;
}

export interface ParsedActionResponse {
  urls: string[];
  suggestedAction: string | null;
}

export interface ParsedInitialResponse {
  baseUrl: string;
  filenames: string[];
  urls: string[];
}

export type PhotoAction = "REPAIR" | "BRIGHTEN" | "DARKEN";
