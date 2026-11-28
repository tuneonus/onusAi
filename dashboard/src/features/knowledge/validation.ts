import type { DocumentListItem, KnowledgeOverviewMetrics } from './types';

export const KNOWLEDGE_MAX_BYTES = 262_144;
export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown'] as const;

export function validateKnowledgeFile(
  file: Pick<File, 'name' | 'size'> | null | undefined,
  maxBytes: number = KNOWLEDGE_MAX_BYTES,
): string | null {
  if (!file) {
    return 'Select a .txt, .md, or .markdown file to upload.';
  }

  const trimmedName = file.name.trim().toLowerCase();
  const hasSupportedExt = SUPPORTED_EXTENSIONS.some((ext) => trimmedName.endsWith(ext));

  if (!hasSupportedExt) {
    return 'Only plain text (.txt) and Markdown (.md, .markdown) files are supported.';
  }

  if (file.size <= 0) {
    return 'The selected file is empty.';
  }

  if (file.size > maxBytes) {
    return `File exceeds the ${Math.round(maxBytes / 1024)} KiB upload limit.`;
  }

  return null;
}

export function validateDocumentTitle(title: string, required: boolean): string | null {
  const trimmed = title.trim();

  if (required && trimmed.length === 0) {
    return 'Document title is required.';
  }

  if (trimmed.length > 200) {
    return 'Document title must be 200 characters or fewer.';
  }

  return null;
}

export function filterDocumentsByQuery(
  items: readonly DocumentListItem[],
  searchQuery: string,
  locationScopeFilter: string,
): DocumentListItem[] {
  const q = searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    if (locationScopeFilter === 'business_wide' && item.locationId !== null) {
      return false;
    }

    if (
      locationScopeFilter !== '' &&
      locationScopeFilter !== 'business_wide' &&
      item.locationId !== locationScopeFilter
    ) {
      return false;
    }

    if (!q) {
      return true;
    }

    const titleMatch = item.title.toLowerCase().includes(q);
    const fileMatch = item.latestVersion?.sourceFilename.toLowerCase().includes(q) ?? false;
    return titleMatch || fileMatch;
  });
}

export function computeKnowledgeOverview(
  items: readonly DocumentListItem[],
): KnowledgeOverviewMetrics {
  let totalActive = 0;
  let publicCount = 0;
  let staffOnlyCount = 0;
  let processingOrUploadedCount = 0;
  let failedCount = 0;
  let deletedCount = 0;
  let totalChunks = 0;

  for (const item of items) {
    if (item.status === 'deleted') {
      deletedCount += 1;
      continue;
    }

    totalActive += 1;
    if (item.visibility === 'public') {
      publicCount += 1;
    } else {
      staffOnlyCount += 1;
    }

    if (item.status === 'uploaded' || item.status === 'processing') {
      processingOrUploadedCount += 1;
    } else if (item.status === 'failed') {
      failedCount += 1;
    }

    totalChunks += item.latestVersion?.chunkCount ?? 0;
  }

  return {
    totalActive,
    publicCount,
    staffOnlyCount,
    processingOrUploadedCount,
    failedCount,
    deletedCount,
    totalChunks,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

