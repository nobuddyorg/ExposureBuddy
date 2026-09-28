import { workerScope } from '../exposure/workerScope';
import { serveRequests } from '../exposure/workerServe';
import { createStackService } from '../vision/pipeline/stackService';
import { createStackSession } from '../vision/pipeline/stackSession';

const scope = workerScope();

serveRequests(
  scope,
  createStackService(createStackSession(), (message) =>
    scope.postMessage(message),
  ),
);
