# Copilot Instructions for AI Coding Agents

## Project Overview
This is a full-stack JavaScript project bootstrapped with Create React App. It includes a React frontend (`src/`), a Node.js/Express-style backend (`api/`), and custom build/deployment configurations for Netlify and Vercel.

## Architecture & Key Components
- **Frontend (React):**
  - Main entry: `src/index.js`, root component: `src/App.js`.
  - UI components in `src/components/`.
  - App state managed in `src/state/appState.js`.
  - Feature modules in `src/features/`.
  - Static assets in `src/assets/` and `public/`.
- **Backend (API):**
  - API endpoints in `api/` (e.g., `api/health.mjs`, `api/hello.js`, `api/wallet.mjs`).
  - Shared utilities in `api/_lib/` (e.g., `supabaseClient.mjs`, `telegram.mjs`, `cors.mjs`).
  - Auth logic in `api/auth/telegram/verify.mjs`.
- **Build/Deploy:**
  - Custom config: `craco.config.js` (for CRA overrides).
  - Netlify: `netlify.toml`, Vercel: `vercel.json`.
  - Build output: `build/`.

## Developer Workflows
- **Start Dev Server:** `npm start` (frontend only)
- **Run Tests:** `npm test` (frontend only)
- **Build for Production:** `npm run build`
- **API Server:** Use `server.js` for custom Node.js server logic if needed.
- **Deploy:** Use Netlify/Vercel configs for deployment. Static assets go to `build/`.

## Project-Specific Patterns & Conventions
- **Frontend:**
  - Use functional React components and hooks.
  - State is centralized in `src/state/appState.js`.
  - Feature code is grouped by domain in `src/features/`.
  - Static images for UI/figma steps are in `src/assets/figma/` and referenced in components.
- **Backend:**
  - API endpoints use `.mjs` (ESM) and `.js` (CJS) extensions; prefer ESM for new code.
  - Shared logic is factored into `api/_lib/`.
  - Telegram authentication is handled in `api/auth/telegram/verify.mjs`.
- **Config:**
  - Use `craco.config.js` for custom Webpack/Babel overrides.
  - Environment variables in `env.local`.

## Integration Points
- **Supabase:** Used for backend data/storage (`api/_lib/supabaseClient.mjs`).
- **Telegram:** Used for authentication (`api/_lib/telegram.mjs`, `api/auth/telegram/verify.mjs`).
- **Netlify/Vercel:** For deployment; see respective config files.

## Examples
- To add a new API endpoint: create a file in `api/`, export an async handler.
- To add a new React feature: create a folder in `src/features/`, add components and state logic.
- To reference a static image: import from `src/assets/figma/` in your component.

## Additional Notes
- Do not use `npm run eject` unless absolutely necessary.
- Follow existing file/folder naming conventions for new code.
- For debugging, use browser devtools for frontend and Node.js debugging for backend.

---

_If any section is unclear or missing important project-specific details, please provide feedback to improve these instructions._
