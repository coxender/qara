# Deployment guide

## Before deploying

1. Choose a host that supports a persistent Node.js process and HTTPS.
2. Run `npm ci` from the `site` directory (or `npm --prefix site ci` from the repository root).
3. Copy `config.example.json` to `config.json` and replace the demo wedding details and colors. Keep this personal configuration out of Git.
4. Configure the environment variables listed in the [README](../README.md#configuration) through the host's secret manager.
5. Set `PUBLIC_ORIGIN` to the exact final HTTPS origin. This is used for same-origin request validation and the QR invite URL.
6. Start the service with `npm start` from `site`.

## Generate secrets

Use a password manager or a cryptographically secure generator. For local PowerShell use:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Generate separate values for the invite token, guest password, and host password. Never reuse the sample values embedded in the current server defaults.

## Operational notes

- Deploy one application instance for the event. Queue data and sessions are not shared between instances.
- A restart clears the queue and signs everyone out. Avoid automatic restarts during the event.
- The app has no persistent logs or analytics. Configure host-level logging if needed, taking care not to log credentials or invite tokens.
- Test the host QR code from a separate phone/browser before sharing it with guests.
- If live YouTube search is enabled, set billing/quota alerts and restrict the API key.

## Post-deployment smoke test

1. Visit `/host` and confirm the host password works.
2. Open the QR code or guest URL in a private browser session.
3. Sign in as a guest, search for a song, and submit it.
4. Confirm the request appears in host review or the approved queue as expected.
