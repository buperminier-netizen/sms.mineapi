# SMS.MineApi

SMS.MineApi is a minimal physical SIM SMS receiving and card-key redemption system. Administrators can create card keys and bind each key to a phone number plus an upstream SMS API URL. End users redeem a card key to view the phone number and verification codes, while the upstream API URL remains hidden from the user-facing interface.

Maintained by the **Open Artivis** open-source community.

![Open Artivis](public/assets/open-artivis-logo.png)

## Screenshots

### Home

![Home](docs/screenshots/home.png)

### Redeemed SIM Card

![Redeemed](docs/screenshots/redeemed.png)

### Admin Dashboard

![Admin Dashboard](docs/screenshots/admin.png)

## Features

- Card-key redemption with phone number display.
- Hidden upstream SMS API URLs on user-facing endpoints.
- Automatic polling plus manual refresh for verification codes.
- Verification-code history sorted by received time with duplicate filtering.
- Expiration countdown starting on first redemption.
- Admin dashboard for create, edit, batch import, status tracking and detail view.
- Downstream name note, visible only to administrators.
- Site settings for logo text, SIM title, footer copyright, system name, admin title and admin password.
- SQLite storage, no separate database service required.

## Stack

- Node.js
- Express
- SQLite / better-sqlite3
- Vanilla HTML / CSS / JavaScript
- Vitest + Supertest
- Playwright for screenshots and frontend checks

## Quick Start

```bash
npm install
cp .env.example .env
npm run demo:init
npm start
```

Open:

- User page: `http://localhost:7060`
- Admin page: `http://localhost:7060/admin.html`

Demo credentials:

- Test card key: `TEST-OPEN-ARTIVIS`
- Admin password: `Minier123`

> Change `ADMIN_PASSWORD`, `SESSION_SECRET`, and the admin password in production.

## Configuration

`.env.example`:

```env
PORT=7060
DATABASE_PATH=./data/sms-mineapi.sqlite
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_PASSWORD=Minier123
DEFAULT_DURATION_DAYS=25
SMS_FETCH_TIMEOUT_MS=10000
AUTO_REFRESH_SECONDS=10
```

| Variable | Description |
| --- | --- |
| `PORT` | HTTP server port |
| `DATABASE_PATH` | SQLite database path |
| `SESSION_SECRET` | Cookie-session signing secret |
| `ADMIN_PASSWORD` | Initial admin password and fallback if no DB password is set |
| `DEFAULT_DURATION_DAYS` | Default card validity in days |
| `SMS_FETCH_TIMEOUT_MS` | Upstream SMS API fetch timeout |
| `AUTO_REFRESH_SECONDS` | Frontend auto refresh interval |

## Admin Usage

The admin dashboard supports:

- Creating single card keys.
- Editing phone number, API URL, status, validity, and downstream note.
- Batch importing card keys.
- Viewing activation status, query count, and last query time.
- Clicking a card key to view details, including activation time, API URL, last query time, and received codes.
- Editing site branding and admin password.

Batch import format:

```txt
cardKey----phoneNumber----apiUrl----durationHours----downstreamName
```

Example:

```txt
TEST-001----+10000000001----http://localhost:7060/demo-sms----600----Open Artivis Demo
```

## SMS API Response

The app extracts verification codes from upstream API responses. Plain text and JSON responses are supported.

Example:

```json
{
  "message": "Your verification code is 492817",
  "receivedAt": "2026-06-03T00:00:00.000Z"
}
```

The parser ignores no-SMS messages and link-expiration timestamps to avoid extracting years as verification codes.

## Security Notes

- Do not commit real upstream SMS API URLs to a public repository.
- Do not use the demo password `Minier123` in production.
- Always change `SESSION_SECRET` in production.
- Deploy behind HTTPS and a reverse proxy.
- Consider restricting admin access by network, proxy rules, or an additional access-control layer.
- If you need downstream integrations, add a separate OpenAPI layer instead of exposing admin APIs.

## Development Commands

```bash
npm test
npm run check
npm run demo:init
npm start
```

## Project Structure

```txt
SMS.MineApi/
  public/              # User and admin static pages
  public/assets/       # Open Artivis visual assets
  src/                 # Express backend
  scripts/             # Demo data and helper scripts
  tests/               # Unit and API tests
  docs/screenshots/    # README screenshots
```

## Community

SMS.MineApi is maintained by the **Open Artivis** open-source community. You can self-host it, fork it, and extend it for your own SMS receiving workflows.

## License

Add a license file according to your publishing plan, such as MIT, Apache-2.0, or a custom license.
