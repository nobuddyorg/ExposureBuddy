import { decodeFitting } from '../exposure/decode';
import { allowOnlyOwnOrigin } from '../exposure/ml/ownOriginOnly';
import { segmentPeople } from '../exposure/ml/personSegmenter';
import { workerScope } from '../exposure/workerScope';
import { serveRequests } from '../exposure/workerServe';
import { createSingleService } from '../vision/pipeline/singleService';

// The single-photo worker: its own script, so the ML runtime stays out of the burst workers' bundle.
// First, before the ML runtime is imported to do anything: nothing in this worker may reach any origin but the app's own.
allowOnlyOwnOrigin(self);

const scope = workerScope();

serveRequests(
  scope,
  createSingleService({ decode: decodeFitting, segmentPeople }, (message) =>
    scope.postMessage(message),
  ),
);
