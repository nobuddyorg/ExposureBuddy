'use client';

import type { ShotDate } from '../../exposure/exifDate';
import type { SingleResult as Result } from '../../exposure/runSingle';
import { useI18n } from '../../i18n/useI18n';
import { useLeaveWarning } from '../../useLeaveWarning';
import { ActionRow } from '../Result/ActionRow';
import { AdjustPanel } from '../Result/AdjustPanel';
import { CompareButton } from '../Result/CompareButton';
import { ParamSlider } from '../Result/ParamSlider';
import { useCanvasImage } from '../Result/useCanvasImage';
import { useCompare } from '../Result/useCompare';
import { useExport, type ExportStatus } from '../Result/useExport';
import { cardClasses } from '../ui/cardClasses';
import { EffectSelect } from './EffectSelect';
import { useEffectRender } from './useEffectRender';

export interface SingleResultProps {
  result: Result;
  /** Back to the picker; the page disposes the result. */
  onStartOver: () => void;
  /** When the photo was taken, for the saved image. */
  shotDate: ShotDate;
}

const PERCENT = 100;
const FULL_TURN = 359;

/** The result screen of the single-photo mode: the photo on a canvas, the effect and its sliders, compare, save and share. */
export default function SingleResult({
  result,
  onStartOver,
  shotDate,
}: SingleResultProps): React.JSX.Element {
  const { t } = useI18n();
  const render = useEffectRender(result);
  const compare = useCompare(result);
  const showingOriginal = compare.comparing && compare.reference !== null;
  const canvasRef = useCanvasImage(
    showingOriginal ? compare.reference : render.image,
  );
  const exporter = useExport(canvasRef, { shotDate });
  // Nothing is kept between visits, so an unsaved result is lost on leaving.
  useLeaveWarning(!exporter.exported);

  const { params } = render;
  const hasDirection = params.effect === 'motion' || params.effect === 'smear';

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
    <section
      data-testid="single-result"
      className="fade-up space-y-5 lg:grid lg:grid-cols-[fit-content(calc(100%-24.5rem))_22rem] lg:grid-rows-[auto_1fr] lg:items-start lg:justify-center lg:gap-x-10 lg:gap-y-5 lg:space-y-0"
    >
      <div className="space-y-1 lg:col-start-2 lg:row-start-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('single.title')}
        </h1>
        <p data-testid="result-stats" className="text-sm text-muted-foreground">
          {t('single.stats', { width: result.width, height: result.height })}
        </p>
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
              showingOriginal ? t('result.single_alt') : t('single.alt')
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
          <div className={cardClasses('space-y-1 p-4 sm:p-5')}>
            <EffectSelect
              value={params.effect}
              disabled={compare.comparing}
              onChange={(effect) => render.setParams({ ...params, effect })}
            />
            <ParamSlider
              testId="strength-slider"
              label={t('single.strength')}
              help={t('single.strength_help')}
              infoLabel={t('result.info', { name: t('single.strength') })}
              unit="%"
              value={Math.round(params.strength * PERCENT)}
              max={PERCENT}
              disabled={compare.comparing}
              onChange={(value) =>
                render.setParams({ ...params, strength: value / PERCENT })
              }
            />
            <ParamSlider
              testId="grow-slider"
              label={t('single.grow')}
              help={t('single.grow_help')}
              infoLabel={t('result.info', { name: t('single.grow') })}
              unit="%"
              value={Math.round(params.grow * PERCENT)}
              max={PERCENT}
              disabled={compare.comparing}
              onChange={(value) =>
                render.setParams({ ...params, grow: value / PERCENT })
              }
            />
            {hasDirection && (
              <ParamSlider
                testId="angle-slider"
                label={t('single.angle')}
                help={t('single.angle_help')}
                infoLabel={t('result.info', { name: t('single.angle') })}
                unit="°"
                value={params.angle}
                max={FULL_TURN}
                disabled={compare.comparing}
                onChange={(angle) => render.setParams({ ...params, angle })}
              />
            )}
          </div>
        </AdjustPanel>
        <ActionRow
          shareSupported={exporter.shareSupported}
          comparing={compare.comparing}
          onDownload={() => void exporter.download()}
          onShare={() => void exporter.share(t('single.title'))}
          onStartOver={onStartOver}
        />
        <p
          role="status"
          data-testid="export-status"
          className="min-h-5 text-sm text-muted-foreground"
        >
          {statusText(exporter.status)}
        </p>
        {render.error !== '' && (
          <p role="alert" className="text-sm text-foreground">
            {t('errors.unknown', { message: render.error })}
          </p>
        )}
      </div>
    </section>
  );
}
