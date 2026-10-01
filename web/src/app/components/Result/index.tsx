'use client';

import type { ShotDate } from '../../exposure/exifDate';
import type { ExposureResult } from '../../exposure/runPipeline';
import { useI18n } from '../../i18n/useI18n';
import { useLeaveWarning } from '../../useLeaveWarning';
import { ActionRow } from './ActionRow';
import { AdjustPanel } from './AdjustPanel';
import { CompareButton } from './CompareButton';
import { SliderPanel } from './SliderPanel';
import {
  sliderMax,
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
  /** When the reference photo was taken, for the saved image. */
  shotDate: ShotDate;
}

/** The result screen: the composite on a canvas, the three sliders, compare, save, share and start over. */
export default function Result({
  result,
  totalCount,
  onStartOver,
  shotDate,
}: ResultProps): React.JSX.Element {
  const { t, tCount } = useI18n();
  const composite = useComposite(result);
  const compare = useCompare(result);
  const showingReference = compare.comparing && compare.reference !== null;
  const canvasRef = useCanvasImage(
    showingReference ? compare.reference : composite.image,
  );
  const exporter = useExport(canvasRef, { shotDate });
  // Nothing is kept between visits, so an unsaved result is lost on leaving.
  useLeaveWarning(!exporter.exported);

  const sliders = toSliderValues(composite.params);
  const setSlider = (name: SliderName, value: number) =>
    composite.setParams(
      toCompositeParams({ ...sliders, [name]: value }, composite.params),
    );

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

  const blurredCount = result.frames.filter(
    (frame) => frame.status === 'blurred',
  ).length;
  const skippedCount = totalCount - result.alignedCount - blurredCount;
  const longEdge = Math.max(result.width, result.height);

  return (
    // Phone: one column. Desktop: the image beside the title, sliders and actions, the pair centred so no gap opens around a portrait photo.
    <section className="fade-up space-y-5 lg:grid lg:grid-cols-[fit-content(calc(100%-24.5rem))_22rem] lg:grid-rows-[auto_1fr] lg:items-start lg:justify-center lg:gap-x-10 lg:gap-y-5 lg:space-y-0">
      <div className="space-y-1 lg:col-start-2 lg:row-start-1">
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
        {skippedCount > 0 && (
          <p
            data-testid="result-skipped"
            className="pt-1 text-sm text-foreground"
          >
            {tCount('result.skipped', skippedCount)}
          </p>
        )}
        {blurredCount > 0 && (
          <p
            data-testid="result-blurred"
            className="pt-1 text-sm text-foreground"
          >
            {tCount('result.blurred', blurredCount)}
          </p>
        )}
      </div>

      <figure className="flex flex-col items-center gap-2 lg:sticky lg:top-24 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <div className="relative max-w-full">
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
            onPointerDown={() => compare.hold(true)}
            onPointerUp={() => compare.hold(false)}
            onPointerCancel={() => compare.hold(false)}
            onPointerLeave={() => compare.hold(false)}
            onContextMenu={(event) => event.preventDefault()}
            // svh, not dvh: the phone's browser bar collapsing on scroll must not resize the picture.
            className="card-lift h-auto max-h-[78svh] w-auto max-w-full touch-pan-y select-none rounded-xl bg-muted ring-1 ring-border lg:max-h-[calc(100svh-11rem)] [-webkit-touch-callout:none]"
          />
          <CompareButton pressed={compare.toggled} onToggle={compare.toggle} />
        </div>
        <figcaption className="text-xs text-muted-foreground">
          {t('result.compare_hint')}
        </figcaption>
      </figure>

      <div className="space-y-4 lg:col-start-2 lg:row-start-2">
        <AdjustPanel>
          <SliderPanel
            values={sliders}
            background={composite.params.background}
            max={sliderMax(longEdge)}
            disabled={compare.comparing}
            onChange={setSlider}
            onBackgroundChange={(background) =>
              composite.setParams({ ...composite.params, background })
            }
            trails={composite.params.trails}
            onTrailsChange={(trails) =>
              composite.setParams({ ...composite.params, trails })
            }
          />
        </AdjustPanel>
        <ActionRow
          shareSupported={exporter.shareSupported}
          comparing={compare.comparing}
          onDownload={() => void exporter.download()}
          onShare={() => void exporter.share(t('result.title'))}
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
    </section>
  );
}
