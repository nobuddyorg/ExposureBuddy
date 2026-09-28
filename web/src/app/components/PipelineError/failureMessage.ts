import type { PipelineFailure } from '../../exposure/failure';
import type { useI18n } from '../../i18n/useI18n';

type Translate = ReturnType<typeof useI18n>['t'];

/** The failure as a sentence for the visitor; one literal per kind, so the i18n parity test sees every key. */
export function failureMessage(t: Translate, failure: PipelineFailure): string {
  switch (failure.kind) {
    case 'unsupported':
      return t('picker.unsupported');
    case 'too_few_aligned':
      return t('errors.too_few_aligned', { count: failure.count });
    case 'decode_failed':
      return t('errors.decode_failed', { name: failure.name });
    case 'cancelled':
      return t('errors.cancelled');
    case 'unknown':
      return t('errors.unknown', { message: failure.message });
  }
}
