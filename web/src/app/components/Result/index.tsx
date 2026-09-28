'use client';

import type { ExposureResult } from '../../exposure/runPipeline';
import { useI18n } from '../../i18n/useI18n';
import { ActionRow } from './ActionRow';
import { SliderPanel } from './SliderPanel';
import {
  toCompositeParams,
  toSliderValues,
  type SliderName,
} from './sliderValues';
import { useCanvasImage } from './useCanvasImage';
import { useCompare } from './useCompare';
import { useComposite } from './useComposite';
import { useExport, type ExportStatus } from './useExport';

export interface ResultProps {
  result: ExposureResult;
  /** How many photos were picked, for the stats line. */
  totalCount: number;
  /** Back to the picker; the page disposes the result. */
  onStartOver: () => void;
}

/** The result screen: the composite on a canvas, the three sliders, compare, save, share and start over. */
export default function Result({
  result,
  totalCount,
  onStartOver,
}: ResultProps): React.JSX.Element {
  const { t } = useI18n();
  const composite = useComposite(result);
  const compare = useCompare(result);
  const showingReference = compare.comparing && compare.reference !== null;
  const canvasRef = useCanvasImage(
    showingReference ? compare.reference : composite.image,
  );
  const exporter = useExport(canvasRef);

  const sliders = toSliderValues(composite.params);
  const setSlider = (name: SliderName, value: number) =>
    composite.setParams(toCompositeParams({ ...sliders, [name]: value }));

  const statusText = (status: ExportStatus): string => {
    switch (status.kind) {
      case 'saved':
        return t('result.saved', { name: status.name });
      case 'share_failed':
        return t('result.share_failed');
      case 'failed':
        return t('errors.unknown', { message: status.message });
      default:
        return '';
    }
  };

  return (
    <section className="fade-up space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('result.title')}
        </h1>
        <p data-testid="result-stats" className="text-sm text-muted-foreground">
          {t('result.stats', {
            aligned: result.alignedCount,
            total: totalCount,
            width: result.width,
            height: result.height,
          })}
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            data-testid="result-canvas"
            width={result.width}
            height={result.height}
            // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- jsx-a11y counts every canvas as interactive; this one is a picture, and img is its role
            role="img"
            aria-label={
              showingReference ? t('result.single_alt') : t('result.alt')
            }
            style={{ aspectRatio: `${result.width} / ${result.height}` }}
            className="card-lift h-auto max-h-[78dvh] w-auto max-w-full rounded-xl bg-muted ring-1 ring-border"
          />
        </div>

        <div className="mt-5 space-y-4 lg:mt-0">
          <SliderPanel
            values={sliders}
            disabled={compare.comparing}
            onChange={setSlider}
          />
          <ActionRow
            shareSupported={exporter.shareSupported}
            comparing={compare.comparing}
            onDownload={() => void exporter.download()}
            onShare={() => void exporter.share(t('result.title'))}
            onToggleCompare={compare.toggle}
            onStartOver={onStartOver}
          />
          <p
            role="status"
            data-testid="export-status"
            className="min-h-5 text-sm text-muted-foreground"
          >
            {statusText(exporter.status)}
          </p>
          {composite.error !== '' && (
            <p role="alert" className="text-sm text-foreground">
              {t('errors.unknown', { message: composite.error })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
