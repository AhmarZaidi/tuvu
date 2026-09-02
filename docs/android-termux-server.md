# Headless Android/Termux Server for Tuvu

This runbook runs Tuvu on a non-rooted Android phone. Termux owns SSH, boot,
wake-lock, and service supervision. An Ubuntu `proot-distro` supplies Linux
Node.js 24. Tuvu runs through its bundled Node/SQLite personal-server runtime;
it does **not** run Wrangler or `workerd` on Android.

Stock `workerd` ARM64 binaries assume a 48-bit virtual address space. Many
Android kernels, including the LG G8X kernel used for this setup, expose a
smaller layout and abort inside TCMalloc. A proot distro cannot change the host
kernel's address space. Do not treat native Termux Node, another Wrangler
version, or more swap as fixes for that failure.

Keep port 8787 on a trusted LAN or private VPN. Do not port-forward it from the
router. Plain HTTP also cannot provide every secure-context browser feature.

## 1. Keep Termux available headlessly

Install Termux, Termux:Boot, and Termux:API from the same F-Droid signing family.
Open Termux:Boot once. Set Termux and Termux:Boot battery use to **Unrestricted**,
exclude them from vendor power saving, and acquire a wake lock.

Install and enable SSH supervision:

```sh
pkg update -y
pkg install -y openssh termux-services rsync proot-distro
termux-wake-lock
. "$PREFIX/etc/profile.d/start-services.sh"
sv-enable sshd
```

Use an SSH public key and verify a new connection before putting the phone away.
Termux SSH normally listens on port 8022.

Create `~/.termux/boot/00-start-services`:

```sh
#!/data/data/com.termux/files/usr/bin/sh
exec >> "$HOME/.termux/boot.log" 2>&1
echo "Boot services started: $(date)"
termux-wake-lock
. /data/data/com.termux/files/usr/etc/profile.d/start-services.sh
```

Then run:

```sh
chmod 700 "$HOME/.termux/boot/00-start-services"
```

Do not launch a second standalone `sshd` when `termux-services` already owns it.

## 2. Install Ubuntu and genuine Linux Node.js 24

From Termux:

```sh
proot-distro install ubuntu
proot-distro login ubuntu
```

Inside Ubuntu:

```sh
apt update
apt install -y ca-certificates curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR=/root/.nvm
. "$NVM_DIR/nvm.sh"
nvm install 24
nvm alias default 24
nvm use 24
node --version
node -p 'process.platform + "/" + process.arch'
```

The platform must be `linux/arm64`, not `android/arm64`. Node 24 is required
because the personal server uses the built-in `node:sqlite` module.

## 3. Build the release on the development computer

To include the current populated local database and secrets:

```sh
npm install
npm run export:server
```

Stop local development servers before exporting live SQLite state. The sensitive
bundle is created at `dist-server/` and contains:

- the built SPA in `dist/client/`;
- the bundled Node personal server in `dist/server/`;
- the TMDB proxy and launch scripts;
- migrations and configuration;
- `.wrangler` state and `.dev.vars` for a populated export.

For a new empty database without secrets:

```sh
npm run export:server:fresh
```

On first startup, a fresh release creates `.tuvu-runtime/tuvu.sqlite` and applies
all committed migrations. A populated export opens the existing Wrangler SQLite
file and applies only migrations missing from its `d1_migrations` ledger.

## 4. Transfer the bundle

Use this layout in Termux:

```sh
mkdir -p "$HOME/tuvu/app" "$HOME/tuvu/backups" "$HOME/tuvu/staging"
```

From WSL, Linux, macOS, or MSYS2:

```sh
rsync -az --delete dist-server/ sanders:~/tuvu/app/
```

Windows PowerShell does not include `rsync`. For an initial copy, OpenSSH `scp`
can copy the directory, including its dotfiles:

```powershell
scp -r "D:\CS\Projects\tuvu\dist-server\." sanders:tuvu/app/
```

Do not copy `node_modules`; the bundled personal server has no runtime npm
dependencies. Existing `node_modules` from earlier Wrangler experiments may be
removed after the new runtime has been verified.

## 5. Run the first interactive test

From Termux, enter Ubuntu with the release bound at `/srv/tuvu`:

```sh
proot-distro login ubuntu --bind "$HOME/tuvu/app:/srv/tuvu"
```

Inside Ubuntu:

```sh
export NVM_DIR=/root/.nvm
. "$NVM_DIR/nvm.sh"
nvm use 24
cd /srv/tuvu
chmod 600 .dev.vars 2>/dev/null || true
npm start
```

No `npm install`, Wrangler command, or D1 migration command is required.

Expected output includes the SQLite path and:

```text
[Tuvu Personal Server] Ready:
  http://127.0.0.1:8787
  http://192.168.x.x:8787
```

From the laptop:

```sh
curl http://sanders.lan:8787/api/health
```

For this LAN deployment, set `PUBLIC_APP_URL=http://sanders.lan:8787` in the
phone's `.dev.vars` if authentication redirects or absolute URLs use that value.
Stop the interactive server with `Ctrl+C` after testing.

## 6. Supervise Tuvu with termux-services

From Termux:

```sh
mkdir -p "$PREFIX/var/service/tuvu/log"
nano "$PREFIX/var/service/tuvu/run"
```

Put this in `run`:

```sh
#!/data/data/com.termux/files/usr/bin/sh
exec 2>&1
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
service_pid=""

shutdown() {
  trap - TERM INT HUP
  if [ -n "$service_pid" ]; then
    "$PREFIX/bin/kill" -TERM -- "-$service_pid" 2>/dev/null || true
    attempts=0
    while kill -0 "$service_pid" 2>/dev/null && [ "$attempts" -lt 20 ]; do
      sleep 0.25
      attempts=$((attempts + 1))
    done
    "$PREFIX/bin/kill" -KILL -- "-$service_pid" 2>/dev/null || true
    wait "$service_pid" 2>/dev/null || true
  fi
  exit 0
}

trap shutdown TERM INT HUP
"$PREFIX/bin/setsid" "$PREFIX/bin/proot-distro" login ubuntu \
  --bind "$HOME/tuvu/app:/srv/tuvu" \
  -- /bin/bash -lc 'export NVM_DIR=/root/.nvm; . "$NVM_DIR/nvm.sh"; nvm use 24 >/dev/null; cd /srv/tuvu; exec node dist/server/index.mjs' &
service_pid=$!
wait "$service_pid"
exit_code=$?
service_pid=""
exit "$exit_code"
```

The process-group wrapper is intentional: proot does not reliably forward
runit's stop signal to Node by itself.

Create the logger and enable the service:

```sh
chmod 700 "$PREFIX/var/service/tuvu/run"
ln -sf "$PREFIX/share/termux-services/svlogger" \
  "$PREFIX/var/service/tuvu/log/run"
sv-enable tuvu
sv up "$PREFIX/var/service/tuvu"
sv status "$PREFIX/var/service/tuvu"
```

Inspect logs with:

```sh
tail -f "$PREFIX/var/log/sv/tuvu/current"
```

### Manual service control

From Termux, use the explicit service path so the commands work even when
`SVDIR` is not present in the shell environment:

```sh
sv status "$PREFIX/var/service/tuvu"
sv up "$PREFIX/var/service/tuvu"
sv down "$PREFIX/var/service/tuvu"
sv restart "$PREFIX/var/service/tuvu"
```

Run the same operations directly from Windows PowerShell:

```powershell
ssh sanders 'sv status "$PREFIX/var/service/tuvu"'
ssh sanders 'sv up "$PREFIX/var/service/tuvu"'
ssh sanders 'sv down "$PREFIX/var/service/tuvu"'
ssh sanders 'sv restart "$PREFIX/var/service/tuvu"'
```

Read recent logs or follow them continuously from the laptop:

```powershell
ssh sanders 'tail -n 50 "$PREFIX/var/log/sv/tuvu/current"'
ssh sanders 'tail -f "$PREFIX/var/log/sv/tuvu/current"'
```

Runit restarts the process after an unexpected exit. It does not watch deployed
files, so a code update requires an explicit restart. Termux:Boot starts the
service supervisor after an Android reboot.

## 7. Push code updates without replacing server data

### Windows PowerShell deployment

Build a code-only release on the laptop. The `fresh` export deliberately omits
the development database and local secret files:

```powershell
npm run export:server:fresh
```

Stop Tuvu, copy only deployable code and assets, restart it, and verify health:

```powershell
ssh sanders 'sv down "$PREFIX/var/service/tuvu"'

scp -r `
  "dist-server\dist" `
  "dist-server\migrations" `
  "dist-server\scripts" `
  "dist-server\package.json" `
  "dist-server\start.sh" `
  sanders:tuvu/app/

ssh sanders 'sv up "$PREFIX/var/service/tuvu"'
ssh sanders 'sv status "$PREFIX/var/service/tuvu"'
for ($attempt = 1; $attempt -le 20; $attempt++) {
  try {
    Invoke-RestMethod http://sanders.lan:8787/api/health
    break
  } catch {
    if ($attempt -eq 20) { throw }
    Start-Sleep -Seconds 1
  }
}
```

This leaves these server-owned paths untouched:

```text
~/tuvu/app/.wrangler/
~/tuvu/app/.tuvu-runtime/
~/tuvu/app/.dev.vars
~/tuvu/app/.dev.providers.local
```

For a backend-only edit with no migration or frontend changes, use the faster
path:

```powershell
npm run build:personal-server
ssh sanders 'sv down "$PREFIX/var/service/tuvu"'
scp -r "dist\server" sanders:tuvu/app/dist/
ssh sanders 'sv up "$PREFIX/var/service/tuvu"'
for ($attempt = 1; $attempt -le 20; $attempt++) {
  try {
    Invoke-RestMethod http://sanders.lan:8787/api/health
    break
  } catch {
    if ($attempt -eq 20) { throw }
    Start-Sleep -Seconds 1
  }
}
```

Use the full deployment whenever migrations, frontend assets, packaging, or
configuration-loading code changed.

### Rsync deployment

On a laptop environment where `rsync` is installed, it can delete obsolete
deployed assets while still preserving both possible database locations and the
server's secrets:

```sh
npm run export:server:fresh
ssh sanders 'sv down "$PREFIX/var/service/tuvu"'
rsync -az --delete \
  --exclude='.wrangler/' \
  --exclude='.tuvu-runtime/' \
  --exclude='.dev.vars' \
  --exclude='.dev.providers.local' \
dist-server/ sanders:~/tuvu/app/
ssh sanders 'sv up "$PREFIX/var/service/tuvu" && sv status "$PREFIX/var/service/tuvu"'
for attempt in $(seq 1 20); do
  if curl --fail http://sanders.lan:8787/api/health; then break; fi
  if [ "$attempt" -eq 20 ]; then exit 1; fi
  sleep 1
done
```

The next start applies pending migrations automatically. If startup fails, leave
the service down and inspect its log before restoring the previous release.

## 8. Back up and restore SQLite safely

Stop Tuvu before copying SQLite, including its WAL files:

```sh
sv down "$PREFIX/var/service/tuvu"
cd "$HOME/tuvu/app"
tar -czf "$HOME/tuvu/backups/tuvu-$(date +%Y%m%d-%H%M%S).tar.gz" \
  .wrangler .tuvu-runtime 2>/dev/null
sv up "$PREFIX/var/service/tuvu"
```

At least one of those state directories will exist. Copy backups off the phone;
do not make its flash storage the only copy of important data.

## 9. Final headless checks

Verify each condition independently:

1. SSH still connects after the screen has been off for at least 30 minutes.
2. `/api/health` still loads after the same idle period.
3. `sv status sshd` and
   `sv status "$PREFIX/var/service/tuvu"` both report `run`.
4. A real reboot restores both services without opening Termux manually.
5. `sanders.lan` still resolves if DHCP assigns a different IPv4 address.

Keep the phone ventilated on a modest charger. Android can still kill processes
under extreme memory pressure, and not every phone automatically boots after a
complete power loss.
