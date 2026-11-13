import { useEffect, useRef, useState } from 'preact/hooks';
import type { Page, PagedScript } from '../engine';

const PX_PER_IN = 96;

/**
 * Draws one page from the engine's positioned lines. Performs no layout of its own:
 * positions come straight from PositionedLine.x / .y.
 */
export function PrintView({ paged, pageIndex }: { paged: PagedScript; pageIndex: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const page: Page | undefined = paged.pages[pageIndex];
  const pageWidthPx = paged.width * PX_PER_IN;
  const pageHeightPx = paged.height * PX_PER_IN;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth > 0 ? el.clientWidth / pageWidthPx : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthPx]);

  return (
    <div class="print-host" ref={host} style={{ height: `${pageHeightPx * scale}px` }}>
      <div
        class="print-page"
        style={{
          width: `${paged.width}in`,
          height: `${paged.height}in`,
          transform: `scale(${scale})`,
        }}
      >
        {page?.lines.map((line, i) => (
          <div
            key={i}
            class={`print-line print-${line.type}`}
            style={{ left: `${line.x}in`, top: `${line.y}in` }}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
