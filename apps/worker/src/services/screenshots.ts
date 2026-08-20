import type { Stagehand } from "@browserbasehq/stagehand";

type StagehandPage = ReturnType<Stagehand["context"]["activePage"]>;

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Every callback below is deliberately flat — no nested functions, and passed
 * inline rather than via a named const.
 *
 * `page.evaluate` ships the callback to the browser via `Function.toString()`,
 * and esbuild (which `tsx` uses in dev) rewrites nested and named functions to
 * `__name(fn, "fn")` for stack traces. That helper only exists in the bundle, so
 * the stringified source throws `__name is not defined` inside the page. Keeping
 * the callbacks flat is what stops the selector-resolution logic below from
 * being shared between them.
 */

/** True when the selector matches at least one node in the live DOM. */
export async function elementExists(
  page: NonNullable<StagehandPage>,
  selector: string,
): Promise<boolean> {
  return page.evaluate<boolean, string>((raw) => {
    const xpath = raw.startsWith("xpath=")
      ? raw.slice(6)
      : raw.startsWith("/") || raw.startsWith("(")
        ? raw
        : null;

    if (xpath) {
      return Boolean(
        document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue,
      );
    }

    try {
      return Boolean(document.querySelector(raw));
    } catch {
      return false;
    }
  }, selector);
}

/**
 * Resolve a selector to a document-space rectangle, scrolling it into view first.
 *
 * The element has to be on screen before capture: CDP's `Page.captureScreenshot`
 * refuses to combine `clip` with `captureBeyondViewport`, so anything outside the
 * visible region would come back blank.
 */
export async function measureElement(
  page: NonNullable<StagehandPage>,
  selector: string,
): Promise<ElementRect | null> {
  return page.evaluate<ElementRect | null, string>((raw) => {
    const xpath = raw.startsWith("xpath=")
      ? raw.slice(6)
      : raw.startsWith("/") || raw.startsWith("(")
        ? raw
        : null;

    let element: Element | null = null;
    if (xpath) {
      const node = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      element = node instanceof Element ? node : null;
    } else {
      try {
        element = document.querySelector(raw);
      } catch {
        element = null;
      }
    }

    if (!element) {
      return null;
    }

    element.scrollIntoView({ block: "center", inline: "center" });

    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      return null;
    }

    return {
      x: box.left + window.scrollX,
      y: box.top + window.scrollY,
      width: box.width,
      height: box.height,
    };
  }, selector);
}

/** Capture the whole scrollable page. */
export async function captureFullPage(
  page: NonNullable<StagehandPage>,
): Promise<Buffer> {
  return page.screenshot({
    fullPage: true,
    type: "png",
    animations: "disabled",
    caret: "hide",
  });
}

/**
 * Capture a padded crop around one element, so a finding card can show the
 * offending control in context rather than the entire page.
 */
export async function captureElementCrop(
  page: NonNullable<StagehandPage>,
  selector: string,
  padding = 24,
): Promise<Buffer | null> {
  const rect = await measureElement(page, selector);
  if (!rect) {
    return null;
  }

  const bounds = await page.evaluate<{ width: number; height: number }>(() => ({
    width: Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0,
    ),
    height: Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
    ),
  }));

  const x = Math.max(0, Math.floor(rect.x - padding));
  const y = Math.max(0, Math.floor(rect.y - padding));
  const width = Math.min(
    Math.ceil(rect.width + padding * 2),
    Math.max(1, bounds.width - x),
  );
  const height = Math.min(
    Math.ceil(rect.height + padding * 2),
    Math.max(1, bounds.height - y),
  );

  if (width < 8 || height < 8) {
    return null;
  }

  return page.screenshot({
    clip: { x, y, width, height },
    type: "png",
    animations: "disabled",
    caret: "hide",
  });
}
