/**
 * Dev-only OpenAI-compatible endpoint, so the full Stagehand pipeline can be
 * exercised without an LLM account.
 *
 * It is a stand-in for the model's *judgement* only — everything else stays real:
 * Stagehand still converts our Zod schemas to JSON Schema, still makes the HTTP
 * call, and still validates what comes back, and the worker still verifies
 * selectors against the live DOM, crops elements, and uploads to MinIO.
 *
 * Responses are derived from the request: observe() replies are built from the
 * accessibility-tree ids in the prompt, and unrecognised schemas are synthesised
 * generically from the JSON Schema so no request goes unanswered.
 *
 *   node apps/worker/dev/mock-llm-server.mjs [port]
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4600);

/**
 * Findings keyed by heuristic pillar. Selectors are real ids on the fixture page,
 * which is what makes selector verification and element cropping meaningful.
 */
const FINDINGS_BY_PILLAR = {
  Accessibility: [
    {
      title: "Brand logo has no alternative text",
      description:
        "The header logo is an <img> with no alt attribute and no accessible name, so screen reader users hear only a filename where the company name belongs.",
      recommendation:
        'Add alt="Nimbus Analytics" to the logo, or alt="" plus an adjacent text wordmark if it is decorative.',
      severity: "High",
      cssSelector: "#brand-logo",
      elementDescription: "company logo image in the page header",
      evidence: '<img id="brand-logo" ... /> has no alt attribute',
    },
    {
      title: "Hero subheading fails contrast requirements",
      description:
        "The hero paragraph renders in #b9c4cc on a #f6f9fb background, roughly 2.1:1, well under the 4.5:1 WCAG AA minimum for body text.",
      recommendation:
        "Darken the .faint colour to at least #5b6b76 against this background, and re-check every element using that class.",
      severity: "High",
      cssSelector: "#hero-subcopy",
      elementDescription: "low contrast hero subheading paragraph",
      evidence: "color: #b9c4cc on background #f6f9fb",
    },
    {
      title: "Email field has no associated label",
      description:
        "The signup input relies on placeholder text alone, which disappears on focus and is not reliably announced as a label by assistive technology.",
      recommendation:
        'Add <label for="email-field">Work email</label> and keep the placeholder for format hints only.',
      severity: "Medium",
      cssSelector: "#email-field",
      elementDescription: "email input in the signup form",
      evidence: 'placeholder="Email" with no <label for>',
    },
    {
      title: "Div styled as a button is not keyboard operable",
      description:
        'The "Talk to sales" control is a div with a click handler but no role, tabindex, or key handling, so keyboard and screen reader users cannot reach or trigger it.',
      recommendation:
        "Replace the div with a <button> element, or add role=\"button\", tabindex=\"0\", and Enter/Space handling.",
      severity: "High",
      cssSelector: "#fake-button",
      elementDescription: "talk to sales control below the hero buttons",
      evidence: '<div class="btn" id="fake-button" onclick="void 0">',
    },
  ],
  "Cognitive Load": [
    {
      title: "Primary navigation has eleven competing items",
      description:
        "The top nav exposes eleven links including near-duplicate pairs such as Pricing/Plans and Company/About, so a visitor has to read the whole list to choose.",
      recommendation:
        "Group the eleven links into four or five top-level areas and merge the duplicate pairs.",
      severity: "Medium",
      cssSelector: "#primary-nav",
      elementDescription: "primary navigation list in the header",
      evidence: "Product, Platform, Solutions, Use cases, Pricing, Plans, Docs…",
    },
    {
      title: "Three equally weighted calls to action in the hero",
      description:
        'Start free trial, Book a demo, and See pricing share identical styling, so nothing signals which one a first-time visitor should pick.',
      recommendation:
        'Keep "Start free trial" as the only filled button and demote the other two to text or outline links.',
      severity: "High",
      cssSelector: "#hero-ctas",
      elementDescription: "row of three call to action buttons in the hero",
      evidence: "three .btn elements with identical styling",
    },
    {
      title: "Hero copy states no concrete benefit",
      description:
        '"Unlock synergistic growth outcomes" and "operationalise your data journey" describe no specific capability, leaving the visitor unsure what the product does.',
      recommendation:
        "Replace the abstractions with one measurable outcome, e.g. what the product does and for whom.",
      severity: "Medium",
      cssSelector: "#hero-heading",
      elementDescription: "hero headline",
      evidence: "Unlock synergistic growth outcomes",
    },
    {
      // Deliberately proposes a selector that does not exist, to exercise the
      // fallback that matches the element description against observe() results.
      title: "Book a demo competes with the trial signup",
      description:
        'The "Book a demo" button carries the same visual weight as the trial signup, so a visitor ready to self-serve is nudged toward a sales conversation instead.',
      recommendation:
        'Style "Book a demo" as a secondary action and keep the filled treatment for the trial.',
      severity: "Medium",
      cssSelector: "#book-demo-button",
      elementDescription: "link: Book a demo",
      evidence: 'two <a class="btn"> siblings with identical styling',
    },
    {
      title: "Unbroken 130-word paragraph in the benefits section",
      description:
        'The "Why teams choose us" section is one long paragraph with no subheadings, lists, or emphasis, so nothing can be skimmed.',
      recommendation:
        "Split it into three or four short claims with subheadings, and pull the key numbers out into a list.",
      severity: "Low",
      cssSelector: "#text-wall",
      elementDescription: "long paragraph in the why teams choose us section",
      evidence: "single <p> of roughly 130 words",
    },
  ],
  Friction: [
    {
      title: "Case studies section is a dead end",
      description:
        'The case studies area reports "No case studies available." with no alternative path, stranding a visitor who came looking for proof.',
      recommendation:
        "Replace the empty state with links to whatever evidence does exist, or hide the section until it has content.",
      severity: "Medium",
      cssSelector: "#empty-state",
      elementDescription: "empty case studies section",
      evidence: "No case studies available.",
    },
    {
      title: "Signup form offers no validation or format hint",
      description:
        'The email field is type="text" with no pattern, no inline validation, and no error messaging, so a typo is only discovered after submitting.',
      recommendation:
        'Use type="email" with required, validate on blur, and describe errors via aria-describedby next to the input.',
      severity: "High",
      cssSelector: "#signup-form",
      elementDescription: "signup form on the get started section",
      evidence: 'input type="text" name="email" with no validation attributes',
    },
    {
      title: "Team size selector covers only very small teams",
      description:
        "The team size options stop at 11-50, so anyone from a larger organisation has no valid choice and must guess or abandon the form.",
      recommendation:
        "Extend the range with 51-200, 201-1000, and 1000+ options, or ask for the number directly.",
      severity: "Low",
      cssSelector: "#team-size",
      elementDescription: "team size select in the signup form",
      evidence: "options: 1-10, 11-50",
    },
  ],
};

const PAGE_OVERVIEW = {
  pageType: "B2B SaaS marketing landing page",
  primaryGoal: "Get the visitor to start a free trial of the analytics product",
  overallImpression:
    "The page looks polished but asks a first-time visitor to do most of the interpretive work, leading with abstract positioning instead of a concrete capability. Three equally weighted calls to action and an eleven-item navigation compound the problem, and several controls are unreachable by keyboard.",
};

function textOf(messages) {
  return messages
    .flatMap((message) => {
      if (typeof message.content === "string") {
        return [message.content];
      }
      if (Array.isArray(message.content)) {
        return message.content.map((part) =>
          typeof part === "string" ? part : (part?.text ?? ""),
        );
      }
      return [];
    })
    .join("\n");
}

/**
 * Build an observe() reply from the accessibility tree Stagehand put in the
 * prompt, so the element ids we return actually resolve to real nodes.
 */
function buildObserveReply(prompt) {
  const seen = new Set();
  const elements = [];
  const lineRe = /\[(\d+-\d+)\]\s*([^\n]*)/g;

  let match;
  while ((match = lineRe.exec(prompt)) !== null) {
    const [, elementId, rest] = match;
    if (seen.has(elementId)) {
      continue;
    }

    const descriptor = rest.trim();
    const interactable =
      /^(link|button|textbox|combobox|checkbox|radio|menuitem|tab|searchbox|slider|switch|option)\b/i.test(
        descriptor,
      );
    if (!interactable) {
      continue;
    }

    seen.add(elementId);
    elements.push({
      elementId,
      description: descriptor.slice(0, 160) || "interactable element",
      method: /^(textbox|searchbox|combobox)/i.test(descriptor)
        ? "fill"
        : "click",
      arguments: /^(textbox|searchbox|combobox)/i.test(descriptor)
        ? ["example"]
        : [],
    });

    if (elements.length >= 25) {
      break;
    }
  }

  return { elements };
}

/** Last-resort filler so an unrecognised schema still gets a valid answer. */
function synthesize(schema, key = "value") {
  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;

  if (schema?.enum?.length) {
    return schema.enum[0];
  }

  switch (type) {
    case "object": {
      const out = {};
      for (const [name, child] of Object.entries(schema.properties ?? {})) {
        out[name] = synthesize(child, name);
      }
      return out;
    }
    case "array":
      return [synthesize(schema.items ?? {}, key)];
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return `mock ${key}`;
  }
}

function replyFor(body) {
  const schema = body?.response_format?.json_schema?.schema ?? {};
  const properties = schema.properties ?? {};
  const prompt = textOf(body?.messages ?? []);

  // Stagehand asks a follow-up "is the extraction complete?" question between
  // chunks. Answering yes ends the loop after a single pass.
  if ("completed" in properties && "progress" in properties) {
    return { progress: "All requested data has been extracted.", completed: true };
  }

  if ("elements" in properties) {
    return buildObserveReply(prompt);
  }

  if ("pageType" in properties) {
    return PAGE_OVERVIEW;
  }

  if ("findings" in properties) {
    const pillar =
      Object.keys(FINDINGS_BY_PILLAR).find((name) =>
        prompt.toLowerCase().includes(name.toLowerCase()),
      ) ??
      (prompt.includes("accessibility defects")
        ? "Accessibility"
        : prompt.includes("friction")
          ? "Friction"
          : "Cognitive Load");

    return { findings: FINDINGS_BY_PILLAR[pillar] ?? [] };
  }

  return synthesize(schema);
}

createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON body" }));
      return;
    }

    const payload = replyFor(body);
    const schemaName = body?.response_format?.json_schema?.name ?? "unknown";
    console.log(
      `[mock-llm] ${req.url} schema=${schemaName} → ${JSON.stringify(payload).length} bytes`,
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "chatcmpl-mock",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body?.model ?? "mock-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(payload) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }),
    );
  });
}).listen(port, () => {
  console.log(
    `[mock-llm] OpenAI-compatible endpoint on http://localhost:${port}/v1`,
  );
});
