'use client';

import { useRef, useState, type DragEvent } from 'react';

export interface DropzoneHandlers {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

/** Drag-and-drop for a file target: `dragging` while files hover over it, `onFiles` with what was dropped. */
export function useDropzone(onFiles: (files: File[]) => void): {
  dragging: boolean;
  handlers: DropzoneHandlers;
} {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child crossed; only the outermost pair changes the highlight.
  const depth = useRef(0);

  const handlers: DropzoneHandlers = {
    onDragEnter: (event) => {
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (event) => {
      event.preventDefault();
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event) => {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      onFiles(Array.from(event.dataTransfer.files));
    },
  };

  return { dragging, handlers };
}
