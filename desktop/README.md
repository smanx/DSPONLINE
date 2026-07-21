# Desktop Packaging

The desktop shell uses Electron and loads the same Vite build as the web/PWA release.

- `npm run desktop:dev`: start Electron against an already-running Vite server at `http://127.0.0.1:4318`.
- `npm run desktop:pack`: produce an unpacked platform bundle. On Windows, if a security scanner locks the freshly extracted Electron directory, the script automatically retries into `release-fallback/`.
- `npm run desktop:dist`: build installable release artifacts.
- `npm run desktop:publish`: build and publish artifacts through electron-builder.

Set `DSP_RELEASE_CHANNEL` to `stable`, `beta`, or `nightly`. Each channel can use its own `DSP_UPDATE_*_URL`; `DSP_UPDATE_URL` overrides the selected channel for a one-off build or self-hosted mirror. Release builds also need the platform signing credentials expected by electron-builder.
