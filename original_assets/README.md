# Original assets vault

This folder holds **master / original** media for Check Station.

## What belongs here

High-resolution logos, source PNGs/JPGs, illustrations, screenshots, branding masters, app/store graphics, and other source media. Files may intentionally be large (several MB or more) and are **not** optimized.

## Protection rules

- Treat every file as **immutable source material**.
- Do **not** delete, rename, overwrite, resize, compress, convert, optimize, or edit originals unless the owner **explicitly** requests that exact action.
- Never replace an original with an optimized version.

## Never use at runtime

Do **not**:

- import these files from React
- reference them from CSS
- serve them as website/static/media assets
- bundle them with Vite
- use them directly in mobile or desktop apps
- expose them via public URLs

## Required workflow

When an original is needed in the product:

1. Leave the file in `original_assets/` untouched.
2. **Copy** it to the correct runtime/source asset location.
3. Optimize / resize / convert the **copy** for that target (web, mobile, or desktop).
4. Use only the optimized copy in the application.

Never modify the master file.
