// Its own module, so the main thread can plan strips without pulling the band kernels into its bundle.
/** Rows per band: small enough that freeing band by band keeps the peak near one copy, large enough to keep the buffer count low. */
export const BAND_ROWS = 64;
