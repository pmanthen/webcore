import type { IssueSeverity } from "@autonomous-ux/database";
import type { Action } from "@browserbasehq/stagehand";
import { Window } from "happy-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveFindings } from "../src/services/heuristics/resolve-findings.js";
import type { RawFinding } from "../src/services/heuristics/schemas.js";

const PAGE_HTML = `
  <header>
    <img class="hero" src="/hero.png">
    <nav id="main-nav">
      <a href="/pricing">Pricing</a>
      <a href="/docs">Docs</a>
    </nav>
  </header>
  <main>
    <form id="signup">
      <input name="email" type="email">
      <button class="cta-primary">Start free trial</button>
    </form>
  </main>
`;

/**
 * Stands in for the browser during selector verification. In production this is
 * `elementExists`, whose body is shipped into the page and run there; here the
 * same CSS query runs against a real DOM implementation, including the guard
 * that turns an unparseable selector into "no match" rather than an exception.
 */
function domSelectorExists(html: string): (selector: string) => Promise<boolean> {
  const document = new Window({ url: "https://example.com/" }).document;
  document.body.innerHTML = html;

  return async (selector: string) => {
    try {
      return Boolean(document.querySelector(selector));
    } catch {
      return false;
    }
  };
}

const OBSERVED: Action[] = [
  {
    selector: "#signup button.cta-primary",
    description: "Start free trial button in the signup form",
  },
  {
    selector: "#main-nav a[href='/pricing']",
    description: "Pricing link in the main navigation",
  },
  {
    selector: "#signup input[name='email']",
    description: "Email address input in the signup form",
  },
];

function rawFinding(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    title: "Primary call to action is easy to miss",
    description: "The trial button sits below the fold with no visual emphasis.",
    recommendation: "Promote it into the hero and give it a filled style.",
    severity: "High",
    cssSelector: null,
    elementDescription: null,
    evidence: null,
    ...overrides,
  };
}

describe("resolveFindings selector verification", () => {
  let selectorExists: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    selectorExists = vi.fn(domSelectorExists(PAGE_HTML));
  });

  function resolve(raw: RawFinding[]) {
    return resolveFindings(raw, {
      category: "Accessibility",
      pageUrl: "https://example.com/",
      observed: OBSERVED,
      selectorExists: selectorExists as (s: string) => Promise<boolean>,
    });
  }

  it("trusts a proposed selector that resolves against the DOM", async () => {
    const [finding] = await resolve([
      rawFinding({ cssSelector: "header img.hero" }),
    ]);

    expect(finding?.elementSelector).toBe("header img.hero");
    expect(finding?.selectorSource).toBe("llm");
    expect(finding?.proposedSelector).toBe("header img.hero");
    expect(selectorExists).toHaveBeenCalledWith("header img.hero");
  });

  it("trusts every shape of valid selector the model might produce", async () => {
    const selectors = [
      "#signup",
      ".cta-primary",
      "input[name='email']",
      "#main-nav a",
      "form#signup > button",
    ];

    for (const selector of selectors) {
      const [finding] = await resolve([rawFinding({ cssSelector: selector })]);
      expect(finding?.selectorSource).toBe("llm");
      expect(finding?.elementSelector).toBe(selector);
    }
  });

  it("falls back to an observed element when the selector was hallucinated", async () => {
    const [finding] = await resolve([
      rawFinding({
        cssSelector: "#free-trial-cta",
        elementDescription: "Start free trial button in the signup form",
      }),
    ]);

    expect(selectorExists).toHaveBeenCalledWith("#free-trial-cta");
    expect(finding?.selectorSource).toBe("observed");
    expect(finding?.elementSelector).toBe("#signup button.cta-primary");
  });

  it("keeps the hallucinated selector for debugging after falling back", async () => {
    const [finding] = await resolve([
      rawFinding({
        cssSelector: "#free-trial-cta",
        elementDescription: "Start free trial button in the signup form",
      }),
    ]);

    expect(finding?.proposedSelector).toBe("#free-trial-cta");
    expect(finding?.elementSelector).not.toBe(finding?.proposedSelector);
  });

  it("treats a syntactically invalid selector as a miss without throwing", async () => {
    // Playwright-flavoured pseudo-classes are a common model invention and are
    // not valid CSS, so querySelector raises rather than returning null.
    const [finding] = await resolve([
      rawFinding({
        cssSelector: "button:has-text('Start free trial')",
        elementDescription: "Start free trial button in the signup form",
      }),
    ]);

    expect(finding?.selectorSource).toBe("observed");
    expect(finding?.elementSelector).toBe("#signup button.cta-primary");
  });

  it("resolves from the description alone when no selector was proposed", async () => {
    const [finding] = await resolve([
      rawFinding({
        cssSelector: null,
        elementDescription: "Pricing link in the main navigation",
      }),
    ]);

    expect(selectorExists).not.toHaveBeenCalled();
    expect(finding?.selectorSource).toBe("observed");
    expect(finding?.elementSelector).toBe("#main-nav a[href='/pricing']");
  });

  it("does not consult the DOM for a blank selector", async () => {
    await resolve([rawFinding({ cssSelector: "   " })]);

    expect(selectorExists).not.toHaveBeenCalled();
  });

  it("prefers the verified selector over the description match", async () => {
    const [finding] = await resolve([
      rawFinding({
        cssSelector: "header img.hero",
        elementDescription: "Pricing link in the main navigation",
      }),
    ]);

    expect(finding?.selectorSource).toBe("llm");
    expect(finding?.elementSelector).toBe("header img.hero");
  });

  it("records no selector when nothing resolves, but keeps the finding", async () => {
    const [finding] = await resolve([
      rawFinding({
        cssSelector: "#newsletter-widget",
        elementDescription: "The footer newsletter subscription widget",
      }),
    ]);

    expect(finding).toBeDefined();
    expect(finding?.elementSelector).toBeNull();
    expect(finding?.selectorSource).toBe("none");
    expect(finding?.proposedSelector).toBe("#newsletter-widget");
  });

  it("records no selector when the model described nothing", async () => {
    const [finding] = await resolve([
      rawFinding({ cssSelector: "#ghost", elementDescription: null }),
    ]);

    expect(finding?.selectorSource).toBe("none");
    expect(finding?.elementSelector).toBeNull();
  });

  it("declines a weak description rather than attaching the wrong element", async () => {
    const [finding] = await resolve([
      rawFinding({
        cssSelector: null,
        elementDescription: "some element somewhere near the bottom",
      }),
    ]);

    expect(finding?.selectorSource).toBe("none");
  });

  it("resolves each finding independently", async () => {
    const findings = await resolve([
      rawFinding({ title: "Hero image has no alt text", cssSelector: "header img.hero" }),
      rawFinding({
        title: "Trial button is buried",
        cssSelector: "#nope",
        elementDescription: "Start free trial button in the signup form",
      }),
      rawFinding({ title: "Docs link is ambiguous", cssSelector: "#also-nope" }),
    ]);

    expect(findings.map((finding) => finding.selectorSource)).toEqual([
      "llm",
      "observed",
      "none",
    ]);
  });

  it("finds nothing to fall back to when observe() returned nothing", async () => {
    const findings = await resolveFindings(
      [
        rawFinding({
          cssSelector: "#ghost",
          elementDescription: "Start free trial button in the signup form",
        }),
      ],
      {
        category: "Friction",
        pageUrl: "https://example.com/",
        observed: [],
        selectorExists: domSelectorExists(PAGE_HTML),
      },
    );

    expect(findings[0]?.selectorSource).toBe("none");
    expect(findings[0]?.elementSelector).toBeNull();
  });
});

describe("resolveFindings normalization", () => {
  function resolve(raw: RawFinding[]) {
    return resolveFindings(raw, {
      category: "Cognitive Load",
      pageUrl: "https://example.com/pricing",
      observed: OBSERVED,
      selectorExists: domSelectorExists(PAGE_HTML),
    });
  }

  it("stamps the pillar category and page URL onto every finding", async () => {
    const [finding] = await resolve([rawFinding()]);

    expect(finding?.category).toBe("Cognitive Load");
    expect(finding?.pageUrl).toBe("https://example.com/pricing");
  });

  it("coerces a severity the schema would have rejected", async () => {
    // Defence in depth: the Zod enum gates this field, but a cached or replayed
    // payload can still reach the resolver with something off-scale.
    const [finding] = await resolve([
      rawFinding({ severity: "blocker" as IssueSeverity }),
    ]);

    expect(finding?.severity).toBe("High");
  });

  it("defaults an unmapped severity to Medium instead of throwing", async () => {
    const [finding] = await resolve([
      rawFinding({ severity: "sev-2" as IssueSeverity }),
    ]);

    expect(finding?.severity).toBe("Medium");
  });

  it("drops findings with no title or no description", async () => {
    const findings = await resolve([
      rawFinding({ title: "   " }),
      rawFinding({ description: "" }),
      rawFinding({ title: "A real finding" }),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe("A real finding");
  });

  it("collapses whitespace and truncates over-long copy", async () => {
    const [finding] = await resolve([
      rawFinding({
        title: `Padded    title\n   with   gaps ${"x".repeat(300)}`,
        description: "y".repeat(900),
      }),
    ]);

    expect(finding?.title).toHaveLength(160);
    expect(finding?.title.endsWith("…")).toBe(true);
    expect(finding?.title.startsWith("Padded title with gaps")).toBe(true);
    expect(finding?.description).toHaveLength(600);
  });

  it("substitutes a placeholder when the agent gave no recommendation", async () => {
    const [finding] = await resolve([rawFinding({ recommendation: "  " })]);

    expect(finding?.recommendation).toBe(
      "No recommendation returned by the agent.",
    );
  });

  it("keeps only the first of two findings with the same title", async () => {
    const findings = await resolve([
      rawFinding({ title: "Navigation is overloaded", severity: "High" }),
      rawFinding({ title: "navigation IS overloaded", severity: "Low" }),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("High");
  });

  it("returns an empty list for an empty extraction", async () => {
    expect(await resolve([])).toEqual([]);
  });
});
