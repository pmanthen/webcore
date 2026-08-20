import type { Stagehand } from "@browserbasehq/stagehand";

type StagehandPage = ReturnType<Stagehand["context"]["activePage"]>;

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve a selector to a document-space rectangle, scrolling it into view first.
 *
 * The element must be on screen before capture: CDP's `Page.captureScreenshot`
 * cannot combine `clip` with `captureBeyondViewport`, so anything outside the
 * visible region would come back blank.
 */
export async function measureElement(
  page: NonNullable<StagehandPage>,
  selector: string,
): Promise<ElementRect | null> {
  const rect = await page.evaluate<ElementRect | null, string>(
    (rawSelector) => {
      const resolve = (value: string): Element | null => {
        const xpath = value.startsWith("xpath=")
          ? value.slice("xpath=".length)
          : value.startsWith("/") || value.startsWith("(")
            ? value
            : null;

        if (xpath) {
          const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          );
          const node = result.singleNodeValue;
          return node instanceof Element ? node : null;
        }

        try {
          return document.querySelector(value);
        } catch {
          return null;
        }
      };

      const element = resolve(rawSelector);
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
    },
    selector,
  );

  return rect;
}

/** True when the selector matches at least one node in the live DOM. */
export async function selectorExists(
  page: NonNullable<StagehandPage>,
  selector: string,
): Promise<boolean> {
  return page.evaluate<boolean, string>((value) => {
    try {
      if (value.startsWith("xpath=") || value.startsWith("/")) {
        const xpath = value.startsWith("xpath=")
          ? value.slice("xpath=".length)
          : value;
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
      return Boolean(document.querySelector(value));
    } catch {
      return false;
    }
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
      document.body?.scrollWidth ?? 0,
    ),
    height: Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0,
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
