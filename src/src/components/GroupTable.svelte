<script lang="ts">
  import {
    FIELD_LABELS,
    FIELD_UNITS,
    orderedColumns,
    orderedFields,
    orderedGroups
  } from '../lib/fields';
  import { formatValue, twistInInches } from '../lib/format';
  import type { Group, GroupList, Value } from '../lib/types';

  interface Props {
    side: 'cartridge' | 'chamber';
    heading: string;
    groups: Record<string, Group | GroupList>;
  }
  let { side, heading, groups }: Props = $props();

  function label(field: string): string {
    return FIELD_LABELS[field] ?? field;
  }
  function unit(field: string): string {
    return FIELD_UNITS[field] ?? 'mm';
  }
  function tolerance(group: Group, field: string): string | null {
    return formatValue((group[`${field}Tol`] ?? null) as Value);
  }

  /**
   * Whether a group has anything to show.
   *
   * A sheet that dimensions no junction cone still carries the heading with every row blank, and
   * rendering that is rendering a heading over nothing -- on a straight-walled pistol case it is
   * most of the page. The heading appears only where the sheet actually states a value.
   *
   * Tolerances do not count. A `L1Tol` with no `L1` would be a tolerance on a dimension that is not
   * published, which is not something to build a section around.
   */
  function hasValues(group: Group | GroupList): boolean {
    if (Array.isArray(group)) return group.length > 0;
    return Object.entries(group).some(
      ([field, value]) => !field.endsWith('Tol') && value !== null && value !== undefined
    );
  }
</script>

<section class="side">
  <h2>{heading}</h2>

  {#each orderedGroups(side, groups) as [name, title] (name)}
    {@const group = groups[name] ?? {}}
    {#if hasValues(group) && Array.isArray(group)}
    <!--
      A repeating group -- a shot cartridge's hull lengths, its chamber's lengths -- is a table
      with one row per entry. It used to fall through the field renderer, which showed each entry
      as "0: [object Object]" (reported 2026-09-03).
    -->
    {@const columns = orderedColumns(side, name, group)}
    <div class="group">
      <h3>{title}</h3>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              {#each columns as column (column)}
                <th class="num">{label(column)}{#if unit(column)} <span class="unit">{unit(column)}</span>{/if}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each group as row, index (index)}
              <tr>
                {#each columns as column (column)}
                  {@const shown = formatValue((row[column] ?? null) as Value)}
                  <td class="num" class:silent={shown === null}>{shown ?? '-'}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    {:else if hasValues(group) && !Array.isArray(group)}
    <div class="group">
      <h3>{title}</h3>
      <dl>
        {#each orderedFields(side, name, group) as field (field)}
          {@const shown = formatValue(group[field] ?? null)}
          {@const tol = tolerance(group, field)}
          <dt class="num">{label(field)}</dt>
          <dd class:silent={shown === null}>
            {#if shown === null}
              <span title="Not published">-</span>
            {:else}
              <span class="num value">{shown}</span>
              {#if unit(field)}<span class="unit">{unit(field)}</span>{/if}
              {#if tol}<span class="num tol">{tol}</span>{/if}
              {#if field === 'u' && typeof group[field] === 'number'}
                <span class="alt-unit num">{twistInInches(group[field] as number)}</span>
              {/if}
            {/if}
          </dd>
        {/each}
      </dl>
    </div>
    {/if}
  {/each}
</section>

<style>
  .side {
    min-width: 0;
  }
  h2 {
    font-size: var(--step-1);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--rule-strong);
    margin-bottom: 1rem;
  }
  .group + .group {
    margin-top: 1.1rem;
  }
  h3 {
    font-size: var(--step-0);
    color: var(--ink);
    margin-bottom: 0.3rem;
  }
  dl {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 0.15rem 0.75rem;
    margin: 0;
    align-items: baseline;
  }
  dt {
    color: var(--ink-2);
    font-size: var(--step-0);
  }
  dd {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .value {
    font-weight: 500;
  }
  .unit,
  .tol,
  .alt-unit {
    font-size: 0.78rem;
    color: var(--ink-3);
  }
  .tol::before {
    content: '';
  }
  .alt-unit {
    color: var(--accent);
  }
  .silent {
    color: var(--ink-3);
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    font-size: var(--step-0);
    width: 100%;
  }
  th,
  td {
    text-align: right;
    padding: 0.2rem 0.6rem 0.2rem 0;
    white-space: nowrap;
  }
  th {
    color: var(--ink-2);
    font-weight: 500;
    border-bottom: 1px solid var(--rule);
  }
  td:first-child,
  th:first-child {
    text-align: left;
  }
  td {
    font-weight: 500;
  }
</style>
