import type { PipelineFailure } from '../../exposure/failure';
import type { useI18n } from '../../i18n/useI18n';

type Translate = ReturnType<typeof useI18n>['t'];
type TranslateCount = ReturnType<typeof useI18n>['tCount'];

/** The failure as a sentence for the visitor; one literal per kind, so the i18n parity test sees every key. */
export function failureMessage(
  t: Translate,
  tCount: TranslateCount,
  failure: PipelineFailure,
): string {
  switch (failure.kind) {
    case 'unsupported':
      return t('picker.unsupported');
    case 'too_few_aligned':
      return tCount('errors.too_few_aligned', failure.count);
    case 'no_overlap':
      return t('errors.no_overlap');
    case 'decode_failed':
      return t('errors.decode_failed', { name: failure.name });
    case 'cancelled':
      return t('errors.cancelled');
    case 'out_of_memory':
      return t('errors.out_of_memory');
    case 'unknown':
      return t('errors.unknown', { message: failure.message });
  }
}
