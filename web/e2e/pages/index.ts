import { type Page } from '@playwright/test';

import { initHeader } from './header';
import { initHelp } from './help';
import { initNotFound } from './not-found';
import { initPicker } from './picker';
import { initPipelineError } from './pipeline-error';
import { initProgress } from './progress';
import { initResult } from './result';

/** Getters, so a spec that wants one screen builds only that screen's locators. */
export type PageTree = ReturnType<typeof createPageTree>;

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
    get progress() {
      return initProgress(page);
    },
    get result() {
      return initResult(page);
    },
  };
}
