# Security policy

## Supported version

Only the latest version on the default branch is supported.

## Reporting a vulnerability

Do not include credentials, invite links, guest data, or exploit details in a public issue. Contact the repository owner privately with a description, affected route or version, and safe reproduction steps. The maintainer should acknowledge the report within seven days and coordinate a fix before disclosure.

## Deployment checklist

- Use unique, high-entropy values for `INVITE_TOKEN`, `GUEST_PASSWORD`, and `HOST_PASSWORD`.
- Set `NODE_ENV=production` and an exact HTTPS `PUBLIC_ORIGIN`.
- Production startup rejects the built-in invite and password defaults; still verify that all configured values are unique.
- Store secrets in the hosting provider's secret manager, never in Git or client-side code.
- Restrict the YouTube API key to the deployed origin/IP and only necessary APIs.
- Treat the in-memory data model as event-only; do not use it to store sensitive personal data.
