import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  formatRunningTime,
  LINES_PER_INCH,
  type Page,
  type PagedScript,
  type PositionedLine,
} from '../engine';

const PX_PER_IN = 96;

function renderText(line: PositionedLine): JSX.Element | string {
  if (!line.styles) return line.text;
  // Cut the line at every style boundary and apply the styles that cover each piece.
  const cuts = new Set([0, line.text.length]);
  for (const s of line.styles) {
    cuts.add(s.from);
    cuts.add(s.to);
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  return (
    <>
      {sorted.slice(0, -1).map((from, i) => {
        const to = sorted[i + 1]!;
        const on = line.styles!.filter((s) => s.from <= from && s.to >= to);
        const style = {
          fontWeight: on.some((s) => s.kind === 'bold') ? 700 : undefined,
          fontStyle: on.some((s) => s.kind === 'italic') ? 'italic' : undefined,
          textDecoration: on.some((s) => s.kind === 'underline') ? 'underline' : undefined,
        };
        return (
          <span key={i} style={style}>
            {line.text.slice(from, to)}
          </span>
        );
      })}
    </>
  );
}

/**
 * Shows exactly one page, drawn from the engine's positioned lines (no layout of its own), with no
 * scrolling. Tap the right third or press PgDn / Space for the next page, the left third or PgUp /
 * Shift+Space for the previous. A tap in the middle third on a printed line selects its source line.
 */
export function PrintView({
  paged,
  pages,
  pageIndex,
  onPage,
  onLine,
}: {
  paged: PagedScript;
  /** Pages in reading order (title page first when present). */
  pages: Page[];
  pageIndex: number;
  onPage: (index: number) => void;
  /** Called with the element index of the tapped line. */
  onLine: (elementIndex: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const page: Page | undefined = pages[pageIndex];
  const { widthIn, heightIn, topMarginIn } = paged.spec;
  const pageWidthPx = widthIn * PX_PER_IN;
  const pageHeightPx = heightIn * PX_PER_IN;
  const last = pages.length - 1;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Fit the whole page in the host: the pane never scrolls, so scaling to width alone would clip
    // the bottom of the page whenever the pane is shorter than the page's aspect ratio.
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0) return setScale(1);
      setScale(h > 0 ? Math.min(w / pageWidthPx, h / pageHeightPx) : w / pageWidthPx);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthPx, pageHeightPx]);

  const go = (i: number) => onPage(Math.min(Math.max(i, 0), last));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) go(pageIndex + 1);
    else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) go(pageIndex - 1);
    else return;
    e.preventDefault();
  };

  const onTap = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    if (fraction >= 2 / 3) go(pageIndex + 1);
    else if (fraction < 1 / 3) go(pageIndex - 1);
    else {
      const idx = Number((e.target as HTMLElement).closest<HTMLElement>('[data-el]')?.dataset.el);
      if (idx >= 0) onLine(idx);
    }
  };

  const label =
    page?.number === 0
      ? `Title page · ${paged.pageCount} pages`
      : `Page ${page?.number ?? 1} of ${paged.pageCount}`;

  return (
    <div class="print-view" tabIndex={0} onKeyDown={onKeyDown}>
      <div class="print-status">
        <span>{label}</span>
        <span>{formatRunningTime(paged.estimatedMinutes)}</span>
      </div>
      <div class="print-host" ref={host}>
        <div
          class="print-sheet"
          style={{ width: `${pageWidthPx * scale}px`, height: `${pageHeightPx * scale}px` }}
          onClick={onTap}
        >
          <div
            class="print-page"
            style={{
              width: `${widthIn}in`,
              height: `${heightIn}in`,
              transform: `scale(${scale})`,
            }}
          >
            {page?.lines.map((line, i) => (
              <div
                key={i}
                class={`print-line print-${line.kind}`}
                data-el={line.elementIndex}
                style={{
                  left: `${line.xIn}in`,
                  top: `${topMarginIn + line.yLine / LINES_PER_INCH}in`,
                }}
              >
                {renderText(line)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
