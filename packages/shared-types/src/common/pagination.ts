// =================================
// PAGINATION TYPES
// =================================

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface CursorInfo {
  id: string;
  createdAt: Date;
}

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function encodeCursor(info: CursorInfo): string {
  return Buffer.from(JSON.stringify(info)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorInfo | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    return JSON.parse(decoded) as CursorInfo;
  } catch {
    return null;
  }
}
