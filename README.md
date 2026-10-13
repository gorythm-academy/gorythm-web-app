# Gorythm Frontend

Frontend application for the Gorythm platform.

## Scripts

- `npm start` - Run the Vite development server (http://localhost:3000, `/api` proxied to the local backend).
- `npm run build` - Build production assets into `build/`.
- `npm run preview` - Serve the production build locally.
- `npm test` - Run the Vitest test suite once (`npm run test:watch` for watch mode).
- `npm run lint:js` - Run JavaScript/JSX lint checks.
- `npm run lint:styles` - Run SCSS style lint checks.
- `npm run lint` - Run both JS and SCSS lint checks.

## Environment variables

The app is built with Vite. Use `VITE_API_URL` and `VITE_SITE_URL` (see `.env.example`). The older
`REACT_APP_API_URL` / `REACT_APP_SITE_URL` names from Create React App are still read, so existing
`.env` files keep working. Node 20.19+ is required.

## Code Quality

- Responsive breakpoints are centralized in `src/styles/_breakpoints.scss`.
- Shared responsive helpers live in `src/styles/_mixins.scss`.
- Frontend coding and SCSS architecture standards are documented in `docs/FRONTEND_STANDARDS.md`.

## Notes

- Avoid hardcoded media-query pixel values in component SCSS.
- Avoid `!important`; resolve via selector structure and ordering.
- Keep large SCSS files modular via feature partials.
