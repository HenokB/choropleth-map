# Verification

## Automated

Run `npm test` with Node.js 20+. Twenty-one tests cover:

- CSV quoting, escaped quotes, multiline values, BOM, separator directives, TSV.
- Country names, aliases, ISO codes, duplicate country totals, missing values, non-finite values.
- Zero and negative values, uniform scales, language-code deduplication, CSV round trips.
- All eight projections producing finite SVG geometry with nonempty land.
- Escaped SVG text, 242 unique feature identifiers, Pacific islands and Antarctica.
- Australia aliases remaining distinct from separately drawn offshore territories.

`npm run build` packages only the public app files into `dist/`.

