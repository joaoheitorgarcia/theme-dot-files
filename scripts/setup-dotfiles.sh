#!/usr/bin/env bash

set -euo pipefail

DRY_RUN=0
FORCE=0
GPU_SETUP=1
INSTALL_DEPS=0

usage() {
  cat <<'EOF'
Usage: ./scripts/setup-dotfiles.sh [--dry-run] [--force] [--install-deps] [--skip-gpu-setup]

Options:
  --dry-run          Print actions without changing anything
  --force            Replace symlinks that point to a different target
  --install-deps     Install Arch packages needed by these dotfiles
  --skip-gpu-setup   Do not detect GPUs or install stable DRM aliases
  -h, --help         Show this help

What it does:
  - Optionally installs Hyprland, AGS, yazi, matugen, kitty, shell plugins, and helper tools on Arch
  - Symlinks every top-level folder in dot-config-files/ to ~/.config/
  - Symlinks dot-zshrc and dot-zprofile into the home directory
  - Backs up existing real files/folders before replacing them
  - Detects DRM devices and configures stable multi-GPU aliases for Hyprland
EOF
}

while (($# > 0)); do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --install-deps) INSTALL_DEPS=1 ;;
    --skip-gpu-setup|--skip-gpu-detect) GPU_SETUP=0 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

log() {
  printf '%s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

try_run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@" || warn "Command failed: $*"
  fi
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CONFIG_SRC="$REPO_ROOT/dot-config-files"
ZSHRC_SRC="$REPO_ROOT/dot-zshrc"
ZPROFILE_SRC="$REPO_ROOT/dot-zprofile"
GPU_UDEV_RULE_DST="/etc/udev/rules.d/99-hyprland-gpus.rules"
GPU_ORDER_FILE="$HOME/.local/state/hypr/gpu-order"
DRM_SYSFS_ROOT="${DRM_SYSFS_ROOT:-/sys/class/drm}"
CONFIG_DST="$HOME/.config"
TS="$(date +%Y%m%d-%H%M%S)"

if [[ ! -d "$CONFIG_SRC" ]]; then
  echo "Missing directory: $CONFIG_SRC" >&2
  exit 1
fi

if [[ ! -f "$ZSHRC_SRC" ]]; then
  echo "Missing file: $ZSHRC_SRC" >&2
  exit 1
fi

if [[ ! -f "$ZPROFILE_SRC" ]]; then
  echo "Missing file: $ZPROFILE_SRC" >&2
  exit 1
fi

aur_helper() {
  local helper

  for helper in paru yay pikaur; do
    if command_exists "$helper"; then
      printf '%s\n' "$helper"
      return 0
    fi
  done

  return 1
}

dedupe_packages() {
  local package
  local seen=" "

  for package in "$@"; do
    if [[ "$seen" == *" $package "* ]]; then
      continue
    fi

    seen+="$package "
    printf '%s\n' "$package"
  done
}

install_arch_packages() {
  local package
  local helper
  local official_packages=()
  local aur_packages=()
  local required_packages=(
    base-devel
    git
    cmake
    meson
    cpio
    pkgconf
    gcc
    nodejs
    npm
    zsh
    hyprland
    hypridle
    hyprlock
    hyprland-plugins
    hyprshot
    xdg-desktop-portal-hyprland
    kitty
    yazi
    qt5ct
    qt6ct
    qt6-base
    qt6-declarative
    qt6-quickcontrols2
    qt6-svg
    qt6-wayland
    pipewire
    pipewire-alsa
    pipewire-audio
    pipewire-jack
    pipewire-pulse
    wireplumber
    libnotify
    libcanberra
    notification-daemon
    polkit
    polkit-kde-agent
    gnome-keyring
    networkmanager
    bluez
    bluez-utils
    rfkill
    upower
    power-profiles-daemon
    brightnessctl
    playerctl
    imv
    mpv
    nano
    libreoffice-fresh
    mupdf
    xdg-utils
    firefox
    jq
    python
    fd
    ripgrep
    fzf
    zoxide
    ffmpegthumbnailer
    poppler
    imagemagick
    7zip
    unarchiver
  )
  local aur_only_packages=(
    ags
    matugen-bin
    quickshell-git
    hyprshade
  )

  if ! command_exists pacman; then
    echo "--install-deps currently supports Arch Linux only: pacman not found." >&2
    exit 1
  fi

  log "Installing Arch dependencies..."

  for package in "${required_packages[@]}"; do
    if pacman -Si "$package" >/dev/null 2>&1; then
      official_packages+=("$package")
    else
      aur_packages+=("$package")
    fi
  done

  if [[ "${#official_packages[@]}" -gt 0 ]]; then
    log "Pacman packages: ${official_packages[*]}"
    run sudo pacman -S --needed --noconfirm "${official_packages[@]}"
  fi

  mapfile -t aur_packages < <(dedupe_packages "${aur_packages[@]}" "${aur_only_packages[@]}")

  if [[ "${#aur_packages[@]}" -gt 0 ]]; then
    if helper="$(aur_helper)"; then
      log "AUR packages via $helper: ${aur_packages[*]}"
      for package in "${aur_packages[@]}"; do
        try_run "$helper" -S --needed --noconfirm "$package"
      done
    else
      warn "No AUR helper found. Install one of paru/yay/pikaur, then install: ${aur_packages[*]}"
    fi
  fi
}

ensure_git_checkout() {
  local url="$1"
  local dst="$2"

  if [[ -d "$dst/.git" ]]; then
    log "OK: $dst already cloned"
    return 0
  fi

  if [[ -e "$dst" ]]; then
    warn "SKIP: $dst exists but is not a git checkout"
    return 0
  fi

  log "Clone: $url -> $dst"
  run git clone --depth=1 "$url" "$dst"
}

install_shell_deps() {
  local custom_dir="$HOME/.oh-my-zsh/custom/plugins"

  if ! command_exists git; then
    warn "SKIP: git is required to install Oh My Zsh plugins"
    return 0
  fi

  ensure_git_checkout "https://github.com/ohmyzsh/ohmyzsh.git" "$HOME/.oh-my-zsh"
  run mkdir -p "$custom_dir"
  ensure_git_checkout "https://github.com/zsh-users/zsh-autosuggestions.git" "$custom_dir/zsh-autosuggestions"
  ensure_git_checkout "https://github.com/zsh-users/zsh-syntax-highlighting.git" "$custom_dir/zsh-syntax-highlighting"
}

install_ags_deps() {
  if ! command_exists npm; then
    warn "SKIP: npm is required to install AGS project dependencies"
    return 0
  fi

  log "Installing AGS npm dependencies..."
  run npm --prefix "$CONFIG_SRC/ags" install
}

set_default_editor() {
  local env_dir="$HOME/.config/environment.d"
  local env_file="$env_dir/editor.conf"

  log "Setting nano as the default editor..."
  run mkdir -p "$env_dir"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] write EDITOR=nano and VISUAL=nano to $env_file"
  else
    printf 'EDITOR=nano\nVISUAL=nano\n' > "$env_file"
  fi

  export EDITOR=nano
  export VISUAL=nano
  try_run systemctl --user import-environment EDITOR VISUAL
}

enable_arch_services() {
  log "Enabling runtime services..."
  try_run sudo systemctl enable --now NetworkManager bluetooth power-profiles-daemon
  try_run systemctl --user enable --now pipewire pipewire-pulse wireplumber
}

install_deps() {
  install_arch_packages
  install_shell_deps
  install_ags_deps
  set_default_editor
  enable_arch_services
}

if [[ "$INSTALL_DEPS" -eq 1 ]]; then
  install_deps
fi

run mkdir -p "$CONFIG_DST"

link_one() {
  local src="$1"
  local dst="$2"
  local backup_dst

  if [[ -L "$dst" ]]; then
    local current
    current="$(readlink "$dst")"
    if [[ "$current" == "$src" ]]; then
      log "OK: $dst already linked"
      return 0
    fi

    if [[ "$FORCE" -eq 1 ]]; then
      log "Replacing symlink: $dst -> $current"
      run rm "$dst"
    else
      log "SKIP: $dst is a symlink to a different target ($current). Use --force to replace."
      return 0
    fi
  elif [[ -e "$dst" ]]; then
    backup_dst="${dst}.bak-${TS}"
    log "Backup: $dst -> $backup_dst"
    run mv "$dst" "$backup_dst"
  fi

  log "Link: $dst -> $src"
  run ln -s "$src" "$dst"
}

while IFS= read -r dir; do
  src="$CONFIG_SRC/$dir"
  dst="$CONFIG_DST/$dir"
  link_one "$src" "$dst"
done < <(find "$CONFIG_SRC" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)

link_one "$ZSHRC_SRC" "$HOME/.zshrc"
link_one "$ZPROFILE_SRC" "$HOME/.zprofile"

configure_gpus() {
  local card
  local card_name
  local device_path
  local gpu_order=""
  local gpu_order_tmp
  local gpu_priority
  local gpu_vendor_name
  local index
  local pci_slot
  local rule_line
  local vendor
  local rule_tmp
  local seen_slots=" "
  local -a gpu_records=()
  local -a ordered_gpus=()

  [[ "$GPU_SETUP" -eq 1 ]] || return 0

  for card in "$DRM_SYSFS_ROOT"/card[0-9]*; do
    [[ -e "$card" ]] || continue
    card_name="$(basename -- "$card")"
    [[ "$card_name" =~ ^card[0-9]+$ ]] || continue
    [[ -r "$card/device/vendor" ]] || continue

    vendor="$(<"$card/device/vendor")"
    device_path="$(readlink -f "$card/device" 2>/dev/null || true)"
    pci_slot="$(basename -- "$device_path")"
    [[ "$pci_slot" =~ ^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]$ ]] || continue

    [[ "$seen_slots" == *" $pci_slot "* ]] && continue
    seen_slots+="$pci_slot "

    # Prefer integrated/non-NVIDIA GPUs. Keep NVIDIA last so outputs wired to
    # it remain available without making it the default renderer.
    case "$vendor" in
      0x8086) gpu_priority=10 ;;
      0x1002) gpu_priority=20 ;;
      0x10de) gpu_priority=90 ;;
      *) gpu_priority=50 ;;
    esac

    gpu_records+=("$(printf '%03d|%s|%s' "$gpu_priority" "$pci_slot" "$vendor")")
  done

  if ((${#gpu_records[@]} > 0)); then
    mapfile -t ordered_gpus < <(printf '%s\n' "${gpu_records[@]}" | sort -t '|' -k1,1n -k2,2)
  fi

  if ((${#ordered_gpus[@]} <= 1)); then
    if ((${#ordered_gpus[@]} == 1)); then
      IFS='|' read -r _ pci_slot vendor <<< "${ordered_gpus[0]}"
      log "GPU detect: one GPU at $pci_slot ($vendor); AQ_DRM_DEVICES override is not needed"
    else
      warn "No DRM GPU cards detected below $DRM_SYSFS_ROOT; AQ_DRM_DEVICES override is disabled."
    fi

    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "[dry-run] write an empty GPU order to $GPU_ORDER_FILE"
      return 0
    fi

    gpu_order_tmp="$(mktemp)"
    printf '\n' > "$gpu_order_tmp"
    install -Dm644 "$gpu_order_tmp" "$GPU_ORDER_FILE"
    rm -f "$gpu_order_tmp"
    return 0
  fi

  log "GPU detect: ${#ordered_gpus[@]} cards; installing stable aliases in preferred order"
  for index in "${!ordered_gpus[@]}"; do
    IFS='|' read -r _ pci_slot vendor <<< "${ordered_gpus[$index]}"
    case "$vendor" in
      0x8086) gpu_vendor_name="Intel" ;;
      0x1002) gpu_vendor_name="AMD" ;;
      0x10de) gpu_vendor_name="NVIDIA" ;;
      *) gpu_vendor_name="$vendor" ;;
    esac
    log "GPU $index: $gpu_vendor_name at $pci_slot -> /dev/dri/hypr-gpu-$index"
    [[ -n "$gpu_order" ]] && gpu_order+=":"
    gpu_order+="/dev/dri/hypr-gpu-$index"
  done

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] install GPU aliases in $GPU_UDEV_RULE_DST"
    log "[dry-run] write AQ_DRM_DEVICES=$gpu_order to $GPU_ORDER_FILE"
    return 0
  fi

  rule_tmp="$(mktemp)"
  printf '%s\n' '# Generated by setup-dotfiles.sh; rerun setup if the GPU topology changes.' > "$rule_tmp"
  for index in "${!ordered_gpus[@]}"; do
    IFS='|' read -r _ pci_slot _ <<< "${ordered_gpus[$index]}"
    rule_line="SUBSYSTEM==\"drm\", KERNEL==\"card[0-9]*\", KERNELS==\"$pci_slot\", SYMLINK+=\"dri/hypr-gpu-$index\""
    printf '%s\n' "$rule_line" >> "$rule_tmp"
  done

  sudo install -Dm644 "$rule_tmp" "$GPU_UDEV_RULE_DST"
  rm -f "$rule_tmp"
  try_run sudo udevadm control --reload-rules
  try_run sudo udevadm trigger --subsystem-match=drm --action=add
  try_run sudo udevadm settle

  gpu_order_tmp="$(mktemp)"
  printf '%s\n' "$gpu_order" > "$gpu_order_tmp"
  install -Dm644 "$gpu_order_tmp" "$GPU_ORDER_FILE"
  rm -f "$gpu_order_tmp"
}

configure_gpus

log "Done."
