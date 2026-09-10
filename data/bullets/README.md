# Sample bullets

This public catalogue contains **75 synthetic sample records: three for each of 25 common cartridge calibers**. The selection is a practical demonstration set, not a sales or popularity ranking.

Every record has `sample: true`, a `sample_` key, and “Sample” in its name. `sampleFor` identifies the cartridge used to group it. Diameters come from that cartridge's existing catalogue record; lengths, masses, construction and G1 coefficients are synthetic demonstration values. These are not manufacturer products or measured performance data. `sources` is empty.

Variants A, B and C demonstrate different proportions. The renderer derives the remaining geometry. Regenerate the samples with `npm run sample-bullets` from `site/`, then run `npm run index` to refresh the search index.

The selected calibers are .22 LR, .17 HMR, .223 Remington, .243 Winchester, .25-06 Remington, 6.5 Creedmoor, .270 Winchester, 7 mm Remington Magnum, .308 Winchester, .30-06 Springfield, .300 Winchester Magnum, 7.62 x 39, .303 British, 8 x 57 IS, .338 Lapua Magnum, .35 Remington, 9.3 x 62, .375 H&H Magnum, .45-70 Government, .380 ACP, 9 mm Luger, .38 Special, .357 Magnum, .40 S&W and .45 ACP.
