# Personal Server Deployment (Node and SQLite)

Tuvu includes a personal-server runtime for trusted home servers and device
testing. It reuses the production Hono routes, maps the D1 API used by Tuvu onto
SQLite, and serves the built SPA. It does not require Wrangler or `workerd` at
runtime, while the normal Cloudflare development and deployment path remains
unchanged.

Do not expose port 8787 directly to the public internet. Use a trusted LAN or a
private VPN. Plain HTTP cannot provide all browser secure-context features.

## Requirements

- A 64-bit system supported by Node.js 24.
- Node.js 24 or newer; the runtime uses built-in `node:sqlite`.
- SSH and preferably `rsync` for deployment.
- Storage for the release, SQLite state, and backups.

No host-specific `node_modules` directory is needed for the exported personal
server. The Hono application and its dependencies are bundled on the development
computer.

## Persistent and replaceable paths

| Path                                                      | Purpose                                     | Update rule                            |
| --------------------------------------------------------- | ------------------------------------------- | -------------------------------------- |
| `dist/client/`, `dist/server/`, `scripts/`, `migrations/` | Release code                                | Replace during updates.                |
| `.wrangler/`                                              | Imported Wrangler D1 state                  | Preserve and back up.                  |
| `.tuvu-runtime/`                                          | Database created by a fresh personal server | Preserve and back up.                  |
| `.dev.vars`                                               | Server secrets                              | Create once, mode `600`, and preserve. |
| `.dev.providers.local`                                    | Optional provider configuration             | Preserve if used.                      |

The runtime prefers the single non-metadata SQLite file in Wrangler's local D1
state. If none exists, it creates `.tuvu-runtime/tuvu.sqlite`. Set
`TUVU_DATABASE_PATH` to override discovery.

## Build a bundle

To clone the current populated local database and secrets, stop local development
servers and run:

```sh
npm install
npm run export:server
```

To create code for a new server without local secrets or state:

```sh
npm run export:server:fresh
```

Both commands build the SPA and the Node personal-server bundle. A populated
bundle is sensitive and must not be uploaded publicly.

## First deployment

The examples use the SSH alias `tuvu-server` and remote directory
`~/tuvu-server`:

```sh
rsync -az --delete dist-server/ tuvu-server:~/tuvu-server/
```

For a fresh release, create its secret file:

```sh
ssh tuvu-server
cd ~/tuvu-server
cp .dev.vars.example .dev.vars
chmod 600 .dev.vars
${EDITOR:-nano} .dev.vars
```

Start it interactively:

```sh
npm start
```

No runtime `npm install` or Wrangler migration command is necessary. Startup
creates a fresh database when required and records committed SQL migrations in
the same `d1_migrations` ledger used by Wrangler.

Verify from another LAN device:

```sh
curl http://tuvu-server:8787/api/health
```

The application listens on `0.0.0.0:8787`. The TMDB helper remains private on
`127.0.0.1:8792`.

## Configuration overrides

The runtime reads non-secret values from `wrangler.jsonc`, then `.dev.vars`, then
matching process environment variables. Personal-server controls are:

| Variable              | Default                                                    |
| --------------------- | ---------------------------------------------------------- |
| `TUVU_HOST`           | `0.0.0.0`                                                  |
| `TUVU_PORT`           | `8787`                                                     |
| `TUVU_DATABASE_PATH`  | Auto-discovered Wrangler DB or `.tuvu-runtime/tuvu.sqlite` |
| `TUVU_MIGRATIONS_DIR` | `migrations`                                               |
| `TUVU_STATIC_DIR`     | `dist/client`                                              |
| `TUVU_ENV_FILE`       | `.dev.vars`                                                |

Relative paths resolve from the release directory.

## Run continuously with systemd

For a release at `/home/tuvu/tuvu-server` and Node installed at `/usr/bin/node`:

```ini
[Unit]
Description=Tuvu Node/SQLite personal server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=tuvu
WorkingDirectory=/home/tuvu/tuvu-server
ExecStart=/usr/bin/node dist/server/index.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Adjust the Node path if a version manager owns it, then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now tuvu
sudo systemctl status tuvu
journalctl -u tuvu -f
```

## Push code updates

Build a code-only release, stop the service, and preserve state and secrets:

```sh
npm run export:server:fresh
ssh tuvu-server 'sudo systemctl stop tuvu'
rsync -az --delete \
  --exclude='.wrangler/' \
  --exclude='.tuvu-runtime/' \
  --exclude='.dev.vars' \
  --exclude='.dev.providers.local' \
  dist-server/ tuvu-server:~/tuvu-server/
ssh tuvu-server 'sudo systemctl start tuvu'
```

Pending migrations apply automatically on startup. Back up before shipping a
schema-changing release.

## Backup and restore

Stop the service so the database and its WAL files form a consistent snapshot:

```sh
sudo systemctl stop tuvu
cd ~/tuvu-server
tar -czf "$HOME/tuvu-$(date +%Y%m%d-%H%M%S).tar.gz" \
  .wrangler .tuvu-runtime 2>/dev/null
sudo systemctl start tuvu
```

To restore, stop the service, move current state aside, extract a selected
backup, and restart. Keep the displaced state until application reads and writes
have been verified.

## Optional Wrangler runtime on supported hosts

The exported package retains `npm run server:wrangler` for debugging on a normal
supported GNU/Linux, macOS, or Windows host. That path requires `npm install` and
uses Wrangler's local D1 state. It is not the Android deployment path.

## Moving to Cloudflare later

Local SQLite files are not uploaded automatically. A later Cloudflare deployment
must provision remote D1, configure its database ID and secrets, apply migrations
with `--remote`, and explicitly export/import data. Keep the Worker entry point
and Wrangler configuration as the Cloudflare source of truth; the personal-server
adapter is only a local hosting boundary.
