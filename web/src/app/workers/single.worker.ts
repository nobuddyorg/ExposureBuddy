import { decodeFitting } from '../exposure/decode';
import { allowOnlyOwnOrigin } from '../exposure/ml/ownOriginOnly';
import { segmentMovers, segmentPeople } from '../exposure/ml/personSegmenter';
import { workerScope } from '../exposure/workerScope';
import { serveRequests } from '../exposure/workerServe';
import { createSingleService } from '../vision/pipeline/singleService';

// Its own script keeps the ML runtime out of the burst workers; first of all, nothing here may reach another origin.
allowOnlyOwnOrigin(self);

const scope = workerScope();

serveRequests(
  scope,
  createSingleService(
    { decode: decodeFitting, segmentPeople, segmentMovers },
    (message) => scope.postMessage(message),
  ),
);
