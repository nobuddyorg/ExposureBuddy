import { decodeAt, decodeReference, isDecodeFailure } from '../exposure/decode';
import { workerScope } from '../exposure/workerScope';
import { serveRequests } from '../exposure/workerServe';
import { createAlignService } from '../vision/pipeline/alignService';
import { createExposureService } from '../vision/pipeline/exposureService';
import { createStackService } from '../vision/pipeline/stackService';
import { createStackSession } from '../vision/pipeline/stackSession';

// The one worker script: every worker the coordinator starts runs it, whichever role it plays.
const scope = workerScope();

serveRequests(
  scope,
  createExposureService(
    createAlignService({ decodeReference, decodeAt }, isDecodeFailure),
    createStackService(createStackSession(), (message) =>
      scope.postMessage(message),
    ),
  ),
);
