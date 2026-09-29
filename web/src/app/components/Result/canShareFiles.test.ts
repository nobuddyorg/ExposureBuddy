import { describe, expect, it, vi } from 'vitest';

import { canShareFiles } from './canShareFiles';

const file = new File(['x'], 'probe.jpg', { type: 'image/jpeg' });

describe('canShareFiles', () => {
  it('is false without the Web Share API', () => {
    expect(canShareFiles({}, file)).toBe(false);
  });

  it('is false when share exists but canShare does not', () => {
    expect(canShareFiles({ share: vi.fn() }, file)).toBe(false);
  });

  it('is false when canShare exists but share does not', () => {
    expect(canShareFiles({ canShare: () => true }, file)).toBe(false);
  });

  it('asks canShare about that very file', () => {
    const canShare = vi.fn(() => true);
    expect(canShareFiles({ canShare, share: vi.fn() }, file)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
  });

  it('is false when canShare declines', () => {
    expect(canShareFiles({ canShare: () => false, share: vi.fn() }, file)).toBe(
      false,
    );
  });
});
