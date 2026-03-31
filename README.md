# Gorythm Frontend

Frontend application for the Gorythm platform.

## Scripts

- `npm start` - Run development server.
- `npm run build` - Build production assets.
- `npm test` - Run test suite.
- `npm run lint:js` - Run JavaScript/JSX lint checks.
- `npm run lint:styles` - Run SCSS style lint checks.
- `npm run lint` - Run both JS and SCSS lint checks.

## Code Quality

- Responsive breakpoints are centralized in `src/styles/_breakpoints.scss`.
- Shared responsive helpers live in `src/styles/_mixins.scss`.
- Frontend coding and SCSS architecture standards are documented in `docs/FRONTEND_STANDARDS.md`.

## Notes

- Avoid hardcoded media-query pixel values in component SCSS.
- Avoid `!important`; resolve via selector structure and ordering.
- Keep large SCSS files modular via feature partials.
