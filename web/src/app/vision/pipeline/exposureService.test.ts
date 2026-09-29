import { describe, expect, it } from 'vitest';

import type { AlignService } from './alignService';
import { createExposureService } from './exposureService';
import type { WorkerRequest } from './protocol';
import type { StackService } from './stackService';

/** Each fake answers with its own name, so the test sees which service a request reached. */
function fakeServices() {
  const align: AlignService = (request) =>
    Promise.resolve({
      response: { type: 'reference-set', id: request.id },
      transfer: [],
    });
  const stack: StackService = (request) =>
    Promise.resolve({
      response: { type: 'added', id: request.id },
      transfer: [],
    });
  return { align, stack };
}

const ALIGN_REQUESTS: readonly WorkerRequest['type'][] = [
  'decode-reference',
  'set-reference',
  'align',
];
const STACK_REQUESTS: readonly WorkerRequest['type'][] = [
  'add-reference',
  'add-frame',
  'stack',
  'render',
  'render-reference',
];

describe('createExposureService', () => {
  it.each(ALIGN_REQUESTS)('hands %s to the align service', async (type) => {
    const { align, stack } = fakeServices();
    const serve = createExposureService(align, stack);
    const served = await serve({ type, id: 4 } as WorkerRequest);
    expect(served.response).toEqual({ type: 'reference-set', id: 4 });
  });

  it.each(STACK_REQUESTS)('hands %s to the stack service', async (type) => {
    const { align, stack } = fakeServices();
    const serve = createExposureService(align, stack);
    const served = await serve({ type, id: 7 } as WorkerRequest);
    expect(served.response).toEqual({ type: 'added', id: 7 });
  });

  it('rejects a request neither service knows, naming its type', async () => {
    const { align, stack } = fakeServices();
    const serve = createExposureService(align, stack);
    await expect(
      serve({ type: 'bogus', id: 1 } as unknown as WorkerRequest),
    ).rejects.toThrow('The worker got a request it does not know: bogus.');
  });
});
