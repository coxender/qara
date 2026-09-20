# Contributing

## Local setup

1. Install Node.js 18 or newer.
2. Run `npm --prefix site ci`.
3. Copy `site/.env.example` to `site/.env` and choose non-default local values.
4. Start the app with `npm --prefix site run dev`.

## Before opening a pull request

- Keep secrets, real event URLs, guest information, and API keys out of commits.
- Run `npm --prefix site run check`.
- Test both the guest flow and `/host` flow in a browser.
- Describe user-visible changes and any configuration changes in the pull request.

## Style

Keep the app dependency-light and use the existing plain Node.js, HTML, CSS, and browser JavaScript approach unless there is a clear reason to introduce a new tool.
