# Third-party software

What this project uses that somebody else wrote, and under what terms.

Two of these are **redistributed**: their code or their files end up in the built site and are
served to whoever opens it. The MIT licence asks that its copyright and permission notice travel
with the copies, which is what this file is for. The rest are build tools, which shape the output
without appearing in it, and are listed because knowing what built a thing is worth as much as
knowing what is in it.

## Redistributed in the built site

### flag-icons

The country flags, one per origin named in the dataset. `src/scripts/build-index.mjs` copies the
seventeen this dataset needs out of the 271 the package ships into `src/public/flags/`, and the
build serves them from there.

- <https://github.com/lipis/flag-icons>
- MIT licence, Copyright (c) 2013 Panayiotis Lipiridis

### Svelte

The framework the site is written in. Its runtime is compiled into the JavaScript the site serves.

- <https://github.com/sveltejs/svelte>
- MIT licence, Copyright (c) 2016-2025 Svelte Contributors

## Build tools

Not served to anybody; they turn the source into the site.

| Package                        | Licence    |
| ------------------------------ | ---------- |
| `vite`                         | MIT        |
| `@sveltejs/vite-plugin-svelte` | MIT        |
| `svelte-check`                 | MIT        |
| `typescript`                   | Apache-2.0 |
| `@tsconfig/svelte`             | MIT        |

## The MIT licence

The text the two redistributed packages above are under, and this project too:

```
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
