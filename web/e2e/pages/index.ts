import { type Page } from '@playwright/test';

import { initHeader } from './header';
import { initHelp } from './help';
import { initNotFound } from './not-found';
import { initPicker } from './picker';
import { initPipelineError } from './pipeline-error';
import { initPrivacy } from './privacy';
import { initProgress } from './progress';
import { initResult } from './result';

/** Getters, so a spec that wants one screen builds only that screen's locators. */
export function createPageTree(page: Page) {
  return {
    get header() {
      return initHeader(page);
    },
    get help() {
      return initHelp(page);
    },
    get notFound() {
      return initNotFound(page);
    },
    get picker() {
      return initPicker(page);
    },
    get pipelineError() {
      return initPipelineError(page);
    },
    get privacy() {
      return initPrivacy(page);
    },
    get progress() {
      return initProgress(page);
    },
    get result() {
      return initResult(page);
    },
  };
}
