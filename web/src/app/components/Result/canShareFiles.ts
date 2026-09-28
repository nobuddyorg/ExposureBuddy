/** The part of `navigator` a file share needs; missing on browsers without the Web Share API. */
export interface FileSharer {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

/** True when `sharer` can hand `file` to the Web Share API; false where the API or file sharing is missing. */
export function canShareFiles(sharer: FileSharer, file: File): boolean {
  if (typeof sharer.canShare !== 'function') return false;
  if (typeof sharer.share !== 'function') return false;
  return sharer.canShare({ files: [file] });
}
