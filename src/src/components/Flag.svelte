<script lang="ts">
  /**
   * Where a cartridge comes from, as the flag of the country whose sheet it is.
   *
   * The origin is printed in the title block of every C.I.P. drawing and the records copy it. It
   * used to be shown as the bare code -- `DE`, `SU`, `IT/DE` -- which is what the record says and
   * which most readers have to decode. The flag is read at a glance in a grid of 532 and the name
   * is on the hover and in the alt text, so nothing is lost to somebody who cannot see it.
   *
   * Six cartridges are standardised by two countries and get two flags, in the order the sheet
   * names them. Two of the twenty codes in the dataset -- `SU` and `CS`, the Soviet Union and
   * Czechoslovakia -- have no current flag, and those keep the code: inventing a successor state
   * for a Soviet sheet would be saying something the sheet does not.
   *
   * Which codes have a flag is decided by the build, which copies only the ones the dataset names
   * out of `flag-icons` and writes the list beside the index. Asking here would mean an image that
   * quietly fails to load.
   */
  import flagged from '../lib/flags.generated.json';
  import { COUNTRY_NAMES } from '../lib/types';

  interface Props {
    codes: string[];
    /** Shown where the dataset names no origin at all; 17 records name none. */
    fallback?: string;
  }
  let { codes, fallback = '' }: Props = $props();

  const drawn = new Set(flagged as string[]);
  function name(code: string): string {
    return COUNTRY_NAMES[code] ?? code;
  }
</script>

{#if codes.length}
  <span class="flags">
    {#each codes as code (code)}
      {#if drawn.has(code)}
        <img
          class="flag"
          src={`${import.meta.env.BASE_URL}flags/${code.toLowerCase()}.svg`}
          alt={name(code)}
          title={name(code)}
          width="16"
          height="12"
          loading="lazy"
          decoding="async"
        />
      {:else}
        <abbr class="code num" title={name(code)}>{code}</abbr>
      {/if}
    {/each}
  </span>
{:else if fallback}
  <span class="flags"><span class="code num">{fallback}</span></span>
{/if}

<style>
  .flags {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    vertical-align: middle;
  }
  .flag {
    display: block;
    width: 1.05rem;
    height: auto;
    /* A hairline, because several of these are white at the edge -- Japan is a white field, and
       without it the flag ends wherever the page background happens to start. */
    border: 1px solid var(--rule-strong);
    border-radius: 1px;
  }
  .code {
    font-size: 0.72rem;
    color: var(--ink-3);
    text-decoration: none;
    border: 1px solid var(--rule);
    border-radius: 2px;
    padding: 0 0.2rem;
    line-height: 1.35;
  }
</style>
