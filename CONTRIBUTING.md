# Contributing

Run `npm start` to work on the app; no dependency installation is needed. Keep UI copy short, source modules focused, and all data processing local.

Before submitting a change:

1. Run `npm test` and `npm run build`.
2. Check the affected workflow in a browser, including a narrow screen and keyboard controls.
3. For geographic changes, check the world, the affected continent, and islands near the antimeridian.
4. For import changes, check zeros, missing values, aliases, duplicate rows, and malformed input. Use `tests/fixtures/countries.xlsx` for an Excel smoke test.

Add tests for data or projection regressions. Include provenance and licenses when adding map data or a bundled library. Do not add runtime analytics or external upload services.
