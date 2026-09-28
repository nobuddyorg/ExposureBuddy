import { decodeAt, decodeReference, isDecodeFailure } from '../exposure/decode';
import { workerScope } from '../exposure/workerScope';
import { serveRequests } from '../exposure/workerServe';
import { createAlignService } from '../vision/pipeline/alignService';

serveRequests(
  workerScope(),
  createAlignService({ decodeReference, decodeAt }, isDecodeFailure),
);
