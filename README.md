# ThemeDotFiles

Personal dotfiles for config and shell setup.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/0f1cbd6c-b9fe-43b7-95d6-d8bfce07d867" />


## Quick Setup (New PC)

```bash
git clone "<your-repo-url>" "$HOME/ThemeDotFiles"
cd "$HOME/ThemeDotFiles"
./scripts/setup-dotfiles.sh --dry-run
./scripts/setup-dotfiles.sh
```

To also install the Arch packages and helper dependencies used by the config:

```bash
./scripts/setup-dotfiles.sh --install-deps
```

## What the setup script does

- Symlinks each top-level folder in `dot-config-files/` to `~/.config/`
- Symlinks `dot-zshrc` to `~/.zshrc`
- Symlinks `dot-zprofile` to `~/.zprofile`
- Detects all DRM GPUs and, on multi-GPU systems, installs stable
  `/dev/dri/hypr-gpu-*` aliases in preferred order for Hyprland. A single-GPU
  system needs no `AQ_DRM_DEVICES` override.
- Stores the detected multi-GPU order in `~/.local/state/hypr/gpu-order`, which
  is read by `hyprland.lua` at startup.
- Backs up existing real files/folders before replacing them:
  - `~/.config/<name>.bak-YYYYMMDD-HHMMSS`
  - `~/.zshrc.bak-YYYYMMDD-HHMMSS`

## Options

```bash
./scripts/setup-dotfiles.sh --dry-run
./scripts/setup-dotfiles.sh --force
./scripts/setup-dotfiles.sh --install-deps
./scripts/setup-dotfiles.sh --skip-gpu-setup
```

- `--dry-run`: preview actions without changing anything
- `--force`: replace conflicting symlinks that point somewhere else
- `--install-deps`: install Arch packages, AUR packages when an AUR helper is available, Oh My Zsh plugins, AGS npm dependencies, nano as the default editor, and runtime services
- `--skip-gpu-setup`: leave any existing GPU aliases and ordering untouched
