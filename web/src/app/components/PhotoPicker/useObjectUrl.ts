'use client';

import { useEffect, useState } from 'react';

/** A `blob:` URL for `file`, empty until the effect has made one; revoked when the file changes or on unmount. */
export function useObjectUrl(file: File): string {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const next = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is a browser resource made and freed in the effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
}
