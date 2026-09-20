# Qara

A private, mobile-friendly wedding music-request queue. Guests can search for songs, add a dedication, and submit requests; hosts can share a QR code and approve or decline requests from a private control page.

> This project currently uses **The Harper Wedding** as demo copy. Update the branding, passwords, and event details before using it for a real event.

## Features

- Password-protected guest and host access
- Shareable guest URL and host-generated QR code
- YouTube Music search when a YouTube Data API key is configured
- Built-in demo search data for local previews without an API key
- Automatic approval for non-explicit songs of six minutes or less
- Immediate “Up next” refresh when an approved request is submitted
- Host review queue for all other requests
- JSON-driven branding, event copy, greetings, and color palette
- Same-origin checks, HTTP-only session cookies, and simple per-session request limiting

## Quick start

**Prerequisite:** Node.js 18 or newer.

```powershell
npm --prefix site ci
Copy-Item site/config.example.json site/config.json
Copy-Item site/.env.example site/.env
npm --prefix site start
```

Open `http://localhost:3000`. The guest invite URL is shown in the server output and follows `/join/<INVITE_TOKEN>`; host controls are at `/host`.

The example configuration uses local-only credentials. Production startup is blocked if any of the built-in invite or password defaults are still in use.

## Configuration

The application reads runtime secrets from environment variables. `site/.env` is intentionally ignored by Git; load its values with your hosting platform or shell.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. |
| `NODE_ENV` | Production only | Set to `production` to enable secure cookies. |
| `PUBLIC_ORIGIN` | Production | Public base URL, e.g. `https://music.example.com`. Must exactly match the browser origin. |
| `INVITE_TOKEN` | Yes | Unpredictable URL segment for guest access. |
| `GUEST_PASSWORD` | Yes | Password guests enter after opening the invite URL. |
| `HOST_PASSWORD` | Yes | Password for `/host`. |
| `YOUTUBE_API_KEY` | No | Enables live YouTube search. Without it, the app uses demo songs. |

### Wedding look and copy

Copy `site/config.example.json` to `site/config.json`, then edit it with the couple/event name, date, location, guest and host greetings, and the eight hexadecimal theme colors. The local `config.json` is ignored by Git so personal event details are not committed. If no file is present, the demo configuration is used.

See [the deployment guide](docs/deployment.md) for production considerations.

## Development

```powershell
npm --prefix site run dev
npm --prefix site run check
```

`check` performs JavaScript syntax validation. The project has no build step or browser framework.

## Project layout

```text
site/                 Node HTTP server and browser assets
site/server.mjs       Routes, sessions, song lookup, and host controls
site/app.js           Guest request interface
site/host.js          Host approval interface
site/styles.css       Shared styling
site/config.example.json  Personalization template for names, copy, and colors
site/.env.example     Safe configuration template
docs/                 Deployment and operational documentation
.github/workflows/    Continuous-integration checks
```

## Limitations

Requests, sessions, rate limits, and selected song metadata are held in process memory. Restarting the server clears them, and running more than one instance will create separate queues. This is appropriate for a single-event, single-process deployment; use a shared database/session store before extending it beyond that.

## Contributing and security

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), rather than opening a public issue with sensitive details.

## License

This project is released under the [MIT License](LICENSE).
