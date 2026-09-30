'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import AppShell from './components/AppShell';
import PhotoPicker from './components/PhotoPicker';
import PipelineError from './components/PipelineError';
import Progress from './components/Progress';
import Result from './components/Result';
import { isPipelineSupported } from './exposure/support';
import { useExposure } from './exposure/useExposure';
import { usePickedPhotos } from './exposure/usePickedPhotos';
import { browserWorkerFactory } from './exposure/workerFactory';
import { useLeaveWarning } from './useLeaveWarning';
import { useWakeLock } from './useWakeLock';
import type { OutputQuality } from './vision/pipeline/budget';

const subscribeToNothing = () => () => {};
const readSupport = () => isPipelineSupported();
// Prerendered as supported: the notice only shows once the client has looked.
const assumeSupported = () => true;

/** The one screen: picker, progress, result or error, driven by the pipeline hook. */
export default function Home() {
  // Read lazily: the page is prerendered to static HTML, where there is no browser to ask.
  const [hardwareConcurrency] = useState(() =>
    typeof navigator === 'undefined'
      ? undefined
      : navigator.hardwareConcurrency,
  );
  const supported = useSyncExternalStore(
    subscribeToNothing,
    readSupport,
    assumeSupported,
  );
  const exposure = useExposure(browserWorkerFactory, hardwareConcurrency);
  const picked = usePickedPhotos();

  const combine = (quality: OutputQuality) =>
    exposure.start(
      picked.photos.map((photo) => photo.file),
      quality,
    );
  // Arrows over the hook's methods: the controller is an object, and unbound-method has a point.
  const backToPicker = () => exposure.reset();
  const startOver = () => {
    exposure.reset();
    picked.clear();
  };

  const { state } = exposure;
  useFocusOnScreenChange(state.status);
  useWakeLock(state.status === 'running');
  useLeaveWarning(state.status === 'running');
  return (
    <AppShell>
      {state.status === 'idle' && (
        <PhotoPicker
          photos={picked.photos}
          notice={picked.notice}
          unsupported={!supported}
          onAdd={picked.add}
          onClear={picked.clear}
          onCombine={combine}
        />
      )}
      {state.status === 'running' && (
        <Progress progress={state.progress} onCancel={backToPicker} />
      )}
      {state.status === 'ready' && (
        <Result
          result={state.result}
          totalCount={picked.photos.length}
          onStartOver={startOver}
        />
      )}
      {state.status === 'failed' && (
        <PipelineError failure={state.failure} onRetry={backToPicker} />
      )}
    </AppShell>
  );
}

/** Moves focus to the main landmark when the screen changes: the control that was focused has just unmounted. */
function useFocusOnScreenChange(status: string) {
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    document.getElementById('main-content')?.focus();
  }, [status]);
}
