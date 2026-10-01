export const MAX_PHOTOS = 100;
export const MIN_PHOTOS = 2;

export interface PickedPhoto {
  readonly id: string;
  readonly file: File;
}

export type PickerNotice =
  | { readonly kind: 'refused'; readonly names: readonly string[] }
  | { readonly kind: 'truncated'; readonly limit: number };

export interface AcceptedPhotos {
  readonly photos: PickedPhoto[];
  /** Names of the files left out for not being images. */
  readonly refused: string[];
  /** Whether MAX_PHOTOS cut the list short. */
  readonly truncated: boolean;
}

// Android sometimes hands over a photo with an empty type; the extension is the only hint left.
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|heic|heif|avif)$/i;

/** Whether `file` is an image by its type, or by its name when the browser reported no type. */
export function isImageFile(file: File): boolean {
  if (file.type !== '') return file.type.startsWith('image/');
  return IMAGE_EXTENSION.test(file.name);
}

function identity(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

/**
 * Appends the images among `incoming` to `current`, in order, without a file already there
 * (same name, size and last-modified) and never past MAX_PHOTOS.
 */
export function acceptPhotos(
  current: readonly PickedPhoto[],
  incoming: readonly File[],
  nextId: () => string,
): AcceptedPhotos {
  const seen = new Set(current.map((photo) => identity(photo.file)));
  const photos = [...current];
  const refused: string[] = [];
  let truncated = false;
  for (const file of incoming) {
    if (!isImageFile(file)) {
      refused.push(file.name);
      continue;
    }
    const key = identity(file);
    if (seen.has(key)) continue;
    if (photos.length >= MAX_PHOTOS) {
      truncated = true;
      break;
    }
    seen.add(key);
    photos.push({ id: nextId(), file });
  }
  return { photos, refused, truncated };
}

/** The one notice an accept outcome earns: refused names first, since they are actionable; else the cap. */
export function toPickerNotice(accepted: AcceptedPhotos): PickerNotice | null {
  if (accepted.refused.length > 0) {
    return { kind: 'refused', names: accepted.refused };
  }
  if (accepted.truncated) return { kind: 'truncated', limit: MAX_PHOTOS };
  return null;
}

/** The middle of the burst: it minimises the largest camera drift to any other frame. */
export function middleIndex(count: number): number {
  return Math.floor((count - 1) / 2);
}

/** Where the reference sits in `photos`: the photo with `chosenId` while it is there, else the middle; −1 when empty. */
export function referencePosition(
  photos: readonly PickedPhoto[],
  chosenId: string,
): number {
  const chosen = photos.findIndex((photo) => photo.id === chosenId);
  return chosen === -1 ? middleIndex(photos.length) : chosen;
}
