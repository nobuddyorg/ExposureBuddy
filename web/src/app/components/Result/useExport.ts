'use client';

import {
  useCallback,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';

import { canShareFiles, type FileSharer } from './canShareFiles';
import { canvasToJpeg, saveBlob } from './canvasExport';
import { errorMessage } from './errorMessage';
import { exportFileName } from './exportFileName';

export type ExportStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saved'; readonly name: string }
  | { readonly kind: 'share_failed'; readonly name: string }
  | { readonly kind: 'failed'; readonly message: string };

export interface ExportController {
  /** Known only after mount: the prerender never sees a navigator. */
  readonly shareSupported: boolean;
  readonly status: ExportStatus;
  download: () => Promise<void>;
  share: (title: string) => Promise<void>;
}

export interface ExportOptions {
  readonly sharer?: FileSharer;
  readonly save?: (blob: Blob, name: string) => void;
  readonly now?: () => Date;
}

const JPEG_TYPE = 'image/jpeg';

// Share support never changes while the page lives, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};

const probeFile = () => new File([], 'probe.jpg', { type: JPEG_TYPE });

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Save and share for the canvas in `canvasRef`; the sharer, the save flow and the clock are injectable. */
export function useExport(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { sharer, save = saveBlob, now = () => new Date() }: ExportOptions = {},
): ExportController {
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' });
  // Read as an external store: the prerender answers false, the client re-renders with its navigator's answer.
  const shareSupported = useSyncExternalStore(
    subscribeToNothing,
    () => canShareFiles(sharer ?? navigator, probeFile()),
    () => false,
  );

  const encode = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('There is no canvas to export yet.');
    const blob = await canvasToJpeg(canvas);
    return new File([blob], exportFileName(now()), { type: JPEG_TYPE });
  }, [canvasRef, now]);

  const download = useCallback(async () => {
    try {
      const file = await encode();
      save(file, file.name);
      setStatus({ kind: 'saved', name: file.name });
    } catch (error) {
      setStatus({ kind: 'failed', message: errorMessage(error) });
    }
  }, [encode, save]);

  const share = useCallback(
    async (title: string) => {
      let file: File;
      try {
        file = await encode();
      } catch (error) {
        setStatus({ kind: 'failed', message: errorMessage(error) });
        return;
      }
      try {
        await (sharer ?? navigator).share?.({ files: [file], title });
      } catch (error) {
        // A dismissed share sheet is not a failure; anything else falls back to a plain save.
        if (isAbort(error)) return;
        save(file, file.name);
        setStatus({ kind: 'share_failed', name: file.name });
      }
    },
    [encode, save, sharer],
  );

  return { shareSupported, status, download, share };
}
