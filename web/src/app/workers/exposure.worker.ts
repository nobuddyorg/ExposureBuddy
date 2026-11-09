import { decodeAt, decodeReference, isDecodeFailure } from '../exposure/decode';
import { loadLearnedDetector } from '../exposure/ml/learnedDetector';
import { allowOnlyOwnOrigin } from '../exposure/ml/ownOriginOnly';
import { workerScope } from '../exposure/workerScope';
import { serveRequests } from '../exposure/workerServe';
import { createAlignService } from '../vision/pipeline/alignService';
import { createExposureService } from '../vision/pipeline/exposureService';
import { createStackService } from '../vision/pipeline/stackService';
import { createStackSession } from '../vision/pipeline/stackSession';

// The one worker script: every worker the coordinator starts runs it, whichever role it plays.
// The learned alignment fetches its weights: nothing here may reach another origin.
allowOnlyOwnOrigin(self);

const scope = workerScope();

serveRequests(
  scope,
  createExposureService(
    createAlignService({ decodeReference, decodeAt }, isDecodeFailure, {
      load: loadLearnedDetector,
    }),
    createStackService(createStackSession(), (message) =>
      scope.postMessage(message),
    ),
  ),
);
