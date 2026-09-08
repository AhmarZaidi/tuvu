# Sanders tmux status monitor

This is a lightweight, read-only Termux status collector intended for tmux. It
shows CPU usage, available/used memory, Termux-data filesystem usage, battery
charge/status/temperature, Wi-Fi IPv4 address, gateway latency, and the state of
the `sshd` and `tuvu` runit services.

The tmux bar refreshes every five seconds. Gateway latency is cached for 30
seconds, so it does not send a ping for every refresh. Override the defaults by
setting `SANDERS_MONITOR_GATEWAY` or `SANDERS_MONITOR_LATENCY_TTL` before
starting tmux.

## Deploy with rsync

From the repository root on a computer with `rsync` and the `sanders` SSH alias:

```sh
rsync -az --delete \
  --exclude='reference/' \
  tools/sanders-monitor/ sanders:~/monitors/sanders/
```

On Sanders:

```sh
pkg install -y tmux rsync iproute2 net-tools
mkdir -p "$HOME/.local/bin"
ln -sf "$HOME/monitors/sanders/sanders-status" \
  "$HOME/.local/bin/sanders-status"
chmod 700 "$HOME/monitors/sanders/sanders-status"
```

Test the one-shot output:

```sh
"$HOME/.local/bin/sanders-status"
sleep 2
"$HOME/.local/bin/sanders-status"
```

The first CPU value may be `?` because CPU percentage needs two samples.

Add this line to `~/.tmux.conf`:

```tmux
source-file ~/monitors/sanders/tmux.conf
```

Start a new tmux session:

```sh
tmux new -s server
```

For an existing tmux server, reload the configuration:

```sh
tmux source-file "$HOME/.tmux.conf"
```

Detach with `Ctrl+b`, then `d`. Reattach later with:

```sh
tmux attach -t server
```

The monitor does not keep a daemon running. tmux invokes it asynchronously for
each status refresh, and the script exits after printing one compact line.
