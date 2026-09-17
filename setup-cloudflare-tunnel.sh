#!/usr/bin/env bash
#
# Guided setup for exposing this ProxyStop server through a Cloudflare
# Tunnel. This is intentionally NOT a silent/unattended installer: it
# explains what each step does, asks for confirmation before it touches
# your Cloudflare account or your system, and pauses whenever you need to
# do something yourself (like logging in through a browser).
#
# Usage: ./setup-cloudflare-tunnel.sh

set -uo pipefail

CONFIG_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/config.json"
DEFAULT_PORT=8000
DEFAULT_LOCAL_HOST="127.0.0.1"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }
info()  { printf '    %s\n' "$1"; }
warn()  { printf '\033[1;33m!!\033[0m %s\n' "$1"; }
err()   { printf '\033[1;31mxx\033[0m %s\n' "$1"; }

confirm() {
  local reply
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

ask() {
  local prompt="$1" default="$2" reply
  read -r -p "$prompt [$default]: " reply
  echo "${reply:-$default}"
}

bold "ProxyStop Server -- Cloudflare Tunnel setup (guided)"
info "This script won't run unattended. It explains each step, asks you to"
info "confirm before changing anything, and pauses whenever you need to act"
info "in your browser (e.g. logging into Cloudflare)."
echo
if ! confirm "Ready to start?"; then
  info "Nothing was done. Re-run this script whenever you're ready."
  exit 0
fi

# ---------------------------------------------------------------------------
step "1. Checking for cloudflared"
# ---------------------------------------------------------------------------
if command -v cloudflared >/dev/null 2>&1; then
  info "Found: $(cloudflared --version 2>&1 | head -n1)"
else
  warn "cloudflared is not installed."
  install_cmd=""
  case "$(uname -s)" in
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        install_cmd='curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null && echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs 2>/dev/null || echo bookworm) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list && sudo apt-get update && sudo apt-get install -y cloudflared'
      elif command -v yum >/dev/null 2>&1; then
        install_cmd='curl -fsSL https://pkg.cloudflare.com/cloudflared.repo | sudo tee /etc/yum.repos.d/cloudflared.repo && sudo yum install -y cloudflared'
      elif command -v pacman >/dev/null 2>&1; then
        install_cmd='sudo pacman -S cloudflared'
      fi
      ;;
    Darwin)
      command -v brew >/dev/null 2>&1 && install_cmd='brew install cloudflared'
      ;;
  esac

  if [[ -n "$install_cmd" ]]; then
    info "Suggested install command for your system:"
    info "  $install_cmd"
    if confirm "Run it now?"; then
      eval "$install_cmd"
    else
      info "Skipping. Install cloudflared yourself, then re-run this script."
      exit 0
    fi
  else
    warn "Couldn't detect a package manager to suggest an install command."
    info "Install cloudflared manually from:"
    info "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    info "Then re-run this script."
    exit 0
  fi

  if ! command -v cloudflared >/dev/null 2>&1; then
    err "cloudflared still isn't on your PATH. Install it, then re-run this script."
    exit 1
  fi
  info "Installed: $(cloudflared --version 2>&1 | head -n1)"
fi

# ---------------------------------------------------------------------------
step "2. Logging into Cloudflare"
# ---------------------------------------------------------------------------
info "This opens a browser tab where you pick the Cloudflare account/zone"
info "this tunnel should belong to, and saves a certificate to ~/.cloudflared/."
if [[ -f "$HOME/.cloudflared/cert.pem" ]]; then
  info "Found an existing login at ~/.cloudflared/cert.pem."
  if confirm "Re-authenticate anyway?"; then
    cloudflared tunnel login
  else
    info "Using the existing login."
  fi
else
  if confirm "Run 'cloudflared tunnel login' now?"; then
    cloudflared tunnel login
  else
    err "A login is required before a tunnel can be created. Exiting."
    exit 1
  fi
fi

if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  err "No certificate found at ~/.cloudflared/cert.pem -- login may not have completed."
  exit 1
fi

# ---------------------------------------------------------------------------
step "3. Creating (or reusing) the tunnel"
# ---------------------------------------------------------------------------
tunnel_name="$(ask "Name for this tunnel" "proxystop-server")"

if cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$tunnel_name"; then
  info "A tunnel named '$tunnel_name' already exists."
  if ! confirm "Reuse it?"; then
    tunnel_name="$(ask "Enter a different tunnel name" "${tunnel_name}-2")"
    confirm "Create tunnel '$tunnel_name'?" && cloudflared tunnel create "$tunnel_name"
  fi
else
  if confirm "Create tunnel '$tunnel_name'?"; then
    cloudflared tunnel create "$tunnel_name"
  else
    err "A tunnel is required to continue. Exiting."
    exit 1
  fi
fi

tunnel_id="$(cloudflared tunnel list -o json 2>/dev/null \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); const t=d.find(x=>x.name===process.argv[1]); if(t) console.log(t.id);' "$tunnel_name" 2>/dev/null)"

if [[ -z "$tunnel_id" ]]; then
  warn "Couldn't auto-detect the tunnel ID from 'cloudflared tunnel list'."
  tunnel_id="$(ask "Paste the tunnel ID shown above" "")"
fi
if [[ -z "$tunnel_id" ]]; then
  err "No tunnel ID available. Exiting."
  exit 1
fi
info "Using tunnel ID: $tunnel_id"

# ---------------------------------------------------------------------------
step "4. Pointing a hostname at the tunnel"
# ---------------------------------------------------------------------------
info "This must be a domain (or subdomain) whose DNS is managed by the same"
info "Cloudflare account you just logged into."
hostname="$(ask "Public hostname to route to this server (e.g. proxystop.example.com)" "")"
while [[ -z "$hostname" ]]; do
  hostname="$(ask "A hostname is required" "")"
done

if confirm "Create a DNS route for '$hostname' -> tunnel '$tunnel_name'?"; then
  cloudflared tunnel route dns "$tunnel_name" "$hostname"
else
  warn "Skipped. You'll need to add the DNS route yourself before the tunnel is reachable."
fi

# ---------------------------------------------------------------------------
step "5. Local server address"
# ---------------------------------------------------------------------------
local_port="$DEFAULT_PORT"
if [[ -f "$CONFIG_FILE" ]] && command -v node >/dev/null 2>&1; then
  detected="$(node -e '
    try {
      const c = require(process.argv[1]);
      if (c.Host && c.Host.port) console.log(c.Host.port);
    } catch (e) {}
  ' "$CONFIG_FILE" 2>/dev/null)"
  [[ -n "$detected" ]] && local_port="$detected"
fi
info "config.json currently listens on port $local_port."
local_port="$(ask "Local port the tunnel should forward to" "$local_port")"
local_host="$(ask "Local address the tunnel should forward to" "$DEFAULT_LOCAL_HOST")"

# ---------------------------------------------------------------------------
step "6. Writing the tunnel config"
# ---------------------------------------------------------------------------
config_dir="$HOME/.cloudflared"
config_path="$config_dir/config.yml"
credentials_path="$config_dir/$tunnel_id.json"

cat <<PREVIEW

This will write:
  $config_path

with:
  tunnel: $tunnel_id
  credentials-file: $credentials_path
  ingress:
    - hostname: $hostname
      service: http://${local_host}:${local_port}
    - service: http_status:404
PREVIEW

write_config=true
if [[ -f "$config_path" ]]; then
  warn "$config_path already exists."
  if ! confirm "Overwrite it?"; then
    write_config=false
    info "Leaving the existing config alone. Update it manually if needed."
  fi
fi

if [[ "$write_config" == true ]]; then
  if confirm "Write it now?"; then
    mkdir -p "$config_dir"
    cat > "$config_path" <<TUNNELCFG
tunnel: $tunnel_id
credentials-file: $credentials_path

ingress:
  - hostname: $hostname
    service: http://${local_host}:${local_port}
  - service: http_status:404
TUNNELCFG
    info "Wrote $config_path"
  else
    info "Skipped writing the config. You'll need to create it yourself before running the tunnel."
  fi
fi

# ---------------------------------------------------------------------------
step "7. Optional: run the tunnel as a systemd service"
# ---------------------------------------------------------------------------
if [[ "$(uname -s)" == "Linux" ]] && command -v systemctl >/dev/null 2>&1; then
  if confirm "Install cloudflared as a systemd service (auto-starts on boot)?"; then
    sudo cloudflared --config "$config_path" service install
    info "Installed. Start it with: sudo systemctl start cloudflared"
    info "Check status with:        sudo systemctl status cloudflared"
  else
    info "Skipped. You can run the tunnel manually (see the next step)."
  fi
else
  info "Not on a systemd Linux host -- skipping the service step."
fi

# ---------------------------------------------------------------------------
step "Done"
# ---------------------------------------------------------------------------
cat <<SUMMARY

Tunnel:      $tunnel_name ($tunnel_id)
Hostname:    https://$hostname
Forwards to: http://${local_host}:${local_port}

Next steps:
  1. Start ProxyStop:  npm start
  2. Run the tunnel:   cloudflared tunnel run $tunnel_name
                        (or, if you installed the service: sudo systemctl start cloudflared)
  3. Visit https://$hostname/health -- you should see "ok".

SUMMARY
