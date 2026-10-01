import type {
  Served,
  StackWorkerRequest,
  StackWorkerResponse,
} from './protocol';
import { transferablesOf, unexpectedRequest } from './protocol';
import type { StackSession } from './stackSession';

export type StackService = (
  request: StackWorkerRequest,
) => Promise<Served<StackWorkerResponse>>;

/** Answers the stack worker's requests over one session; `postProgress` sends stacking progress mid-request. */
export function createStackService(
  session: StackSession,
  postProgress: (message: StackWorkerResponse) => void,
): StackService {
  const served = (
    response: StackWorkerResponse,
    transfer: ArrayBuffer[] = [],
  ): Served<StackWorkerResponse> => ({ response, transfer });

  const dispatch = (
    request: StackWorkerRequest,
  ): Served<StackWorkerResponse> => {
    const { id } = request;
    switch (request.type) {
      case 'add-reference':
        session.addReference(request.image, request.stripRows);
        return served({ type: 'added', id });
      case 'add-frame':
        session.addFrame(request.index, request.frame);
        return served({ type: 'added', id });
      case 'drop-frame':
        session.dropFrame(request.index);
        return served({ type: 'dropped', id });
      case 'crop':
        return served({ type: 'cropped', id, ...session.crop() });
      case 'stack-rows':
        session.stackRows(request.rows, (fraction) =>
          postProgress({ type: 'stack-progress', id, fraction }),
        );
        return served({ type: 'stacked', id });
      case 'add-rows':
        session.addRows(request.index, request.frame, request.rows);
        return served({ type: 'added', id });
      case 'render': {
        const image = session.render(request.params);
        return served(
          { type: 'rendered', id, image },
          transferablesOf({ image }),
        );
      }
      case 'render-reference': {
        const image = session.renderReference();
        return served(
          { type: 'rendered', id, image },
          transferablesOf({ image }),
        );
      }
      default:
        throw unexpectedRequest('stack service', request satisfies never);
    }
  };

  // Deferred so a session error surfaces as a rejection, the one failure path the worker glue knows.
  return (request) => Promise.resolve().then(() => dispatch(request));
}
