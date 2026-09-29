import type { AlignService } from './alignService';
import type { Served, WorkerRequest, WorkerResponse } from './protocol';
import { unexpectedRequest } from './protocol';
import type { StackService } from './stackService';

export type ExposureService = (
  request: WorkerRequest,
) => Promise<Served<WorkerResponse>>;

/**
 * One handler for every request a worker can get, whichever role the coordinator gave it.
 * Every worker runs the same script, so a browser that starts two workers from one URL cannot mix their roles up.
 */
export function createExposureService(
  align: AlignService,
  stack: StackService,
): ExposureService {
  return (request) => {
    switch (request.type) {
      case 'decode-reference':
      case 'set-reference':
      case 'align':
        return align(request);
      case 'add-reference':
      case 'add-frame':
      case 'stack':
      case 'render':
      case 'render-reference':
        return stack(request);
      default:
        return Promise.reject(unexpectedRequest('worker', request));
    }
  };
}
