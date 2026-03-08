// A single block of rich content within a question or answer.
// The discriminated union means TypeScript knows exactly which fields
// are available depending on the 'type' value - no guessing needed.
export type ContentBlock =
  | { type: "text"; value: string; formatting?: TextFormatting }
  | { type: "image"; url: string; alt?: string }
  | { type: "video"; url: string; caption?: string };

// Supported text formatting options.
export type TextFormatting = "bold" | "italic" | "underline" | "code";

// A record of a file uploaded to R2 storage
export interface Upload {
  id: number;
  ownerId: number;
  key: string; // the R2 object key, e.g. "users/42/abc-123.jpg"
  publicUrl: string; // the full CDN URL used in ContentBlock
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

// Response returned after a successful upload confirmation
export interface UploadConfirmResponse {
  upload: Upload;
  publicUrl: string;
}

// Request body for the presign route
export interface PresignRequest {
  mimeType: string;
}

// Response from the presign route
export interface PresignResponse {
  url: string; // the presigned R2 upload URL
  key: string; // the object key - needed for the confirm step
}
