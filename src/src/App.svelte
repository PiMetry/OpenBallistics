<script lang="ts">
  import Cartridge from './routes/Cartridge.svelte';
  import List from './routes/List.svelte';
  import { href, route } from './lib/router';

  const current = $derived($route);
  const repository = import.meta.env.VITE_REPO ?? 'PiMetry/OpenBallistics';

  /**
   * Light or dark, chosen by the reader and kept per browser. `app.css` defines the palette
   * light-first and redefines it for `[data-theme='dark']` and for the system preference where
   * nothing is stamped on the root, so the toggle only has to stamp the root: an explicit choice
   * wins in both directions, and with none stored the system decides.
   */
  type Theme = 'light' | 'dark';
  const THEME_KEY = 'theme';
  function storedTheme(): Theme | null {
    try {
      const value = localStorage.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }
  function systemTheme(): Theme {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  let theme = $state<Theme>(storedTheme() ?? systemTheme());
  $effect(() => {
    document.documentElement.dataset.theme = theme;
  });
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage may be unavailable; the choice still applies for this visit.
    }
  }
</script>

<a class="skip" href="#main">Skip to content</a>

<header class="bar">
  <!--
    The site is not named after C.I.P. and does not present itself as theirs.
    It carried a "C.I.P." mark and the title "Tables of Dimensions", which is the standard's own
    name in the standard's own typography -- close enough to read as a C.I.P. publication. The
    dimensions are cited to C.I.P. in the footer, which is attribution; the masthead is this
    project's own.
  -->
  <a class="brand" href={href.list()}>
    <span class="mark">OB</span>
    <span class="title">Cartridge &amp; chamber dimensions</span>
  </a>
  <nav class="tools" aria-label="Site">
    <a class="tool" href={href.list()} aria-current={current.view === 'list' ? 'page' : undefined}>Home</a>
    <a class="tool" href={`https://github.com/${repository}`} target="_blank" rel="noopener noreferrer">
      GitHub
    </a>
    <button
      type="button"
      class="tool"
      onclick={toggleTheme}
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {#if theme === 'dark'}☀ Light{:else}☾ Dark{/if}
    </button>
  </nav>
</header>

<!--
  The reference-only notice, on top of every page and red, where it used to be a footer paragraph
  nobody scrolls to. Asked for 2026-09-03. It is the one thing every visitor must read before
  using a number, so it is the first thing on the page.
-->
<aside class="alert" role="alert">
  <p class="alert-title">Reference only - alpha</p>
  <p>
    Verify every figure against the official C.I.P. tables before machining a chamber, cutting a
    reamer, or loading ammunition. These pages are a convenience for reading published dimensions
    and are not a substitute for the standard.
  </p>
  <!--
    What "alpha" means, rather than the word on its own. A reader who is about to cut metal needs
    to know what the label buys them, and the honest answer is: not much yet. How far any one
    record has been read against its sheet is said on that record's page, not here.
  -->
  <p class="alert-alpha">
    <strong>This site is in development and at alpha status</strong>: it is an early, incomplete
    version, published so it can be checked and corrected. Expect errors, gaps and changes to the
    data, and treat nothing here as settled.
  </p>
</aside>

<main id="main">
  {#if current.view === 'cartridge'}
    <Cartridge key={current.key} />
  {:else}
    <List />
  {/if}
</main>

<footer>
  <p>
    Dimensions are specified by the <strong>Permanent International Commission for the Proof of
    Small Arms (C.I.P.)</strong> and published in its <em>Tables of Dimensions of Cartridges and
    Chambers</em>. C.I.P. is the authority for these values.
    <strong>This site is independent and is not affiliated with, endorsed by, or published by
    C.I.P.</strong>
  </p>
  <p>
    The dimensions themselves are technical facts and nobody's property; no rights are claimed over
    them here, and none could be. Everything else, the records, the drawings and the code behind
    this site, is under the MIT licence.
  </p>

</footer>

<style>
  .skip {
    position: absolute;
    left: -9999px;
  }
  .skip:focus {
    left: 1rem;
    top: 1rem;
    z-index: 10;
    background: var(--surface);
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.9rem clamp(1rem, 4vw, 2.5rem);
    border-bottom: 1px solid var(--rule);
    background: var(--surface);
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    color: var(--ink);
  }
  .brand:hover {
    text-decoration: none;
  }
  .mark {
    font-family: var(--mono);
    font-weight: 600;
    letter-spacing: 0.02em;
    border: 1.5px solid var(--ink);
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
  }
  .title {
    font-weight: 500;
    color: var(--ink-2);
  }
  .tools {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .tool {
    font-size: var(--step-0);
    color: var(--ink-2);
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    padding: 0.3rem 0.7rem;
    text-decoration: none;
    cursor: pointer;
    font-family: inherit;
  }
  .tool:hover {
    color: var(--ink);
    border-color: var(--accent);
    text-decoration: none;
  }
  .tool[aria-current='page'] {
    color: var(--ink-3);
    border-color: var(--rule);
    pointer-events: none;
  }
  /* Wide enough for the cartridge page to set its two tables two columns deep each; see
     `GroupTable.svelte`. A phone gets the padding it can afford and no more. */
  main {
    max-width: 92rem;
    margin: 0 auto;
    padding: clamp(0.9rem, 4vw, 2.5rem);
  }
  footer {
    max-width: 92rem;
    margin: 0 auto;
    padding: 1.5rem clamp(1.25rem, 4vw, 2.5rem) 3rem;
    border-top: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: 0.8rem;
  }
  footer p {
    margin: 0 0 0.6rem;
    max-width: 78ch;
  }
  footer p:last-child {
    margin-bottom: 0;
  }
  footer strong {
    color: var(--ink);
  }
  .alert {
    background: var(--alert-soft);
    color: var(--alert);
    border-bottom: 1px solid var(--alert);
    padding: 0.7rem clamp(1rem, 4vw, 2.5rem);
    font-size: var(--step-0);
  }
  .alert p {
    margin: 0;
    max-width: 92rem;
    margin-inline: auto;
  }
  .alert-title {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.78rem;
    margin-bottom: 0.15rem;
  }
  /* Quieter than the sentence above it: not verifying a figure can hurt somebody, and an
     unfinished dataset cannot, so the two do not shout equally loudly. */
  .alert-alpha {
    margin-top: 0.35rem;
    font-size: 0.78rem;
    opacity: 0.85;
  }
</style>
