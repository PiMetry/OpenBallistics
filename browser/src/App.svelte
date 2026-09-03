<script lang="ts">
  import Cartridge from './routes/Cartridge.svelte';
  import List from './routes/List.svelte';
  import { href, route } from './lib/router';

  const current = $derived($route);
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
</header>

<!--
  The reference-only notice, on top of every page and red, where it used to be a footer paragraph
  nobody scrolls to. Asked for 2026-09-03. It is the one thing every visitor must read before
  using a number, so it is the first thing on the page.
-->
<aside class="alert" role="alert">
  <p class="alert-title">Reference only</p>
  <p>
    Verify every figure against the official C.I.P. tables before machining a chamber, cutting a
    reamer, or loading ammunition. These pages are a convenience for reading published dimensions
    and are not a substitute for the standard.
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
  main {
    max-width: 82rem;
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 2.5rem);
  }
  footer {
    max-width: 82rem;
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
    max-width: 82rem;
    margin-inline: auto;
  }
  .alert-title {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.78rem;
    margin-bottom: 0.15rem;
  }
</style>
