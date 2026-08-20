/**
 * Dev-only fixture site: a deliberately flawed landing page used to exercise the
 * audit pipeline end to end without depending on a third-party URL.
 *
 * Every defect below is real and has a stable selector, so selector resolution
 * and element cropping can be verified against actual DOM geometry.
 *
 *   node apps/worker/dev/fixture-site.mjs [port]
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4599);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nimbus Analytics — grow faster, somehow</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #22303c;
      }
      header { border-bottom: 1px solid #e3e8ec; padding: 18px 32px; }
      nav ul {
        display: flex; flex-wrap: wrap; gap: 18px;
        list-style: none; margin: 0; padding: 0; font-size: 14px;
      }
      .hero { padding: 56px 32px; background: #f6f9fb; }
      .hero h1 { font-size: 40px; margin: 0 0 12px; }
      .hero p { max-width: 620px; font-size: 18px; }
      /* Deliberate defect: ~2.1:1 contrast, well below WCAG AA. */
      .faint { color: #b9c4cc; }
      .cta-row { display: flex; gap: 12px; margin-top: 28px; }
      .btn {
        padding: 12px 22px; border-radius: 6px; border: 0;
        background: #0f766e; color: #fff; font-size: 15px;
        font-weight: 600; cursor: pointer; text-decoration: none;
      }
      section { padding: 48px 32px; border-top: 1px solid #e3e8ec; }
      .wall { max-width: 760px; line-height: 1.7; }
      form { display: flex; flex-direction: column; gap: 12px; max-width: 380px; }
      input, select {
        padding: 10px 12px; border: 1px solid #cfd8de;
        border-radius: 6px; font-size: 15px;
      }
      footer { padding: 32px; border-top: 1px solid #e3e8ec; font-size: 13px; }
    </style>
  </head>
  <body>
    <header>
      <!-- Defect: logo image has no alt text. -->
      <img id="brand-logo" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDAiIGhlaWdodD0iMzIiPjxyZWN0IHdpZHRoPSIxNDAiIGhlaWdodD0iMzIiIGZpbGw9IiMwZjc2NmUiLz48L3N2Zz4=" width="140" height="32" />
      <!-- Defect: 11 top-level nav items, several near-duplicates. -->
      <nav id="primary-nav">
        <ul>
          <li><a href="/product">Product</a></li>
          <li><a href="/platform">Platform</a></li>
          <li><a href="/solutions">Solutions</a></li>
          <li><a href="/use-cases">Use cases</a></li>
          <li><a href="/pricing">Pricing</a></li>
          <li><a href="/plans">Plans</a></li>
          <li><a href="/docs">Docs</a></li>
          <li><a href="/resources">Resources</a></li>
          <li><a href="/company">Company</a></li>
          <li><a href="/about">About</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </nav>
    </header>

    <main>
      <div class="hero">
        <h1 id="hero-heading">Unlock synergistic growth outcomes</h1>
        <!-- Defect: low-contrast body copy. -->
        <p class="faint" id="hero-subcopy">
          Leverage best-in-class paradigms to operationalise your data journey at
          enterprise scale.
        </p>
        <!-- Defect: three identically weighted primary CTAs. -->
        <div class="cta-row" id="hero-ctas">
          <a class="btn" href="/signup">Start free trial</a>
          <a class="btn" href="/demo">Book a demo</a>
          <a class="btn" href="/pricing">See pricing</a>
        </div>
        <!-- Defect: a div acting as a button, no role or tabindex. -->
        <div class="btn" id="fake-button" onclick="void 0" style="margin-top:16px;display:inline-block">
          Talk to sales
        </div>
      </div>

      <section>
        <h2>Why teams choose us</h2>
        <!-- Defect: undifferentiated wall of text, no subheadings or lists. -->
        <p class="wall" id="text-wall">
          Our platform provides a comprehensive suite of capabilities designed to
          address the evolving needs of modern organisations operating at scale in
          increasingly competitive markets. By combining a flexible architecture
          with an extensible integration surface, teams are able to consolidate
          previously fragmented workflows into a single coherent operating model
          that reduces overhead while simultaneously improving visibility across
          every layer of the stack. Stakeholders across engineering, product,
          marketing, and finance gain access to a shared source of truth, which in
          turn accelerates decision cycles and reduces the coordination cost that
          typically accompanies cross-functional initiatives of this nature, and
          which historically has represented one of the most significant barriers
          to realising value from investments in data infrastructure and tooling.
        </p>
      </section>

      <section>
        <h2>Get started</h2>
        <!-- Defect: unlabelled email input, no validation, no format hint. -->
        <form id="signup-form" action="/subscribe" method="post">
          <input id="email-field" type="text" name="email" placeholder="Email" />
          <select id="team-size" name="team_size">
            <option>1-10</option>
            <option>11-50</option>
          </select>
          <button class="btn" type="submit">Continue</button>
        </form>
      </section>

      <section>
        <h2>Case studies</h2>
        <!-- Defect: dead end — empty state with no path forward. -->
        <div id="empty-state">
          <p class="faint">No case studies available.</p>
        </div>
      </section>
    </main>

    <footer>
      <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
    </footer>
  </body>
</html>`;

createServer((req, res) => {
  if (req.url === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }

  // Only the root serves the page, so an unknown path exercises the worker's
  // "there is no page to audit" guard.
  if (req.url !== "/") {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>404</title><h1>Not found</h1>");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}).listen(port, () => {
  console.log(`[fixture-site] serving flawed landing page on http://localhost:${port}`);
});
