-- Hyprland 0.55+ Lua configuration.
-- https://wiki.hypr.land/Configuring/Start/

----------------
--- Monitors ---
----------------

local laptop_monitor = "eDP-2"
local external_monitor = "HDMI-A-1"
local workspaces_per_monitor = 10

hl.monitor({
    output = laptop_monitor,
    mode = "preferred",
    position = "0x0",
    scale = 1,
})

hl.monitor({
    output = external_monitor,
    mode = "preferred",
    position = "auto-left",
    scale = 1,
})

-- Give each monitor an on-demand workspace bank. The laptop owns the real IDs
-- 1-10, while the external monitor uses 11-20 (shown as 1-10 in AGS).
for workspace = 1, workspaces_per_monitor do
    hl.workspace_rule({
        workspace = tostring(workspace),
        monitor = laptop_monitor,
        default = workspace == 1,
    })

    hl.workspace_rule({
        workspace = tostring(workspace + workspaces_per_monitor),
        monitor = external_monitor,
        default = workspace == 1,
    })
end

----------------
--- Programs ---
----------------

local terminal = "kitty"
local file_manager = "kitty yazi"
local menu = "ags toggle appmenu -i ags"

-----------------
--- Autostart ---
-----------------

hl.on("hyprland.start", function()
    hl.exec_cmd("systemctl --user start pipewire pipewire-pulse wireplumber")
    hl.exec_cmd("dbus-update-activation-environment --systemd DISPLAY WAYLAND_DISPLAY XDG_CURRENT_DESKTOP")
    hl.exec_cmd("/usr/bin/gnome-keyring-daemon --start --components=pkcs11,secrets,ssh,gpg")
    hl.exec_cmd("env GSK_RENDERER=cairo DRI_PRIME=0 __NV_PRIME_RENDER_OFFLOAD=0 ags run ~/.config/ags/app.ts")
    hl.exec_cmd("hypridle -q")
    hl.exec_cmd("hyprpm reload")
end)

-------------------
--- Environment ---
-------------------

hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")
hl.env("QT_QPA_PLATFORMTHEME", "qt5ct")
hl.env("QT_QPA_PLATFORMTHEME", "qt6ct")
hl.env("HYPRSHOT_DIR", "Pictures/Screenshots")

-- Prefer the integrated/default GPU. Use nvrun for NVIDIA offload apps.
hl.env("DRI_PRIME", "0")
hl.env("__NV_PRIME_RENDER_OFFLOAD", "0")

---------------------
--- Look and feel ---
---------------------

hl.config({
    cursor = {
        no_hardware_cursors = true,
    },

    general = {
        gaps_in = 10,
        gaps_out = {
            top = 5,
            right = 25,
            bottom = 25,
            left = 25,
        },
        border_size = 1,
        col = {
            active_border = {
                colors = { "rgba(33ccffee)", "rgba(00ff99ee)" },
                angle = 45,
            },
            inactive_border = "rgba(595959aa)",
        },
        resize_on_border = true,
        allow_tearing = false,
        layout = "dwindle",
    },

    decoration = {
        rounding = 5,
        rounding_power = 5,
        active_opacity = 1.0,
        inactive_opacity = 1.0,
        shadow = {
            enabled = true,
            range = 4,
            render_power = 3,
            color = "rgba(1a1a1aee)",
        },
        blur = {
            enabled = true,
            size = 3,
            passes = 1,
            vibrancy = 0.1696,
        },
    },

    animations = {
        enabled = true,
    },

    dwindle = {
        preserve_split = true,
    },

    master = {
        new_status = "master",
    },

    misc = {
        force_default_wallpaper = 0,
        disable_hyprland_logo = true,
    },
})

------------------
--- Animations ---
------------------

hl.curve("easeOutQuint", {
    type = "bezier",
    points = { { 0.23, 1 }, { 0.32, 1 } },
})
hl.curve("easeInOutCubic", {
    type = "bezier",
    points = { { 0.65, 0.05 }, { 0.36, 1 } },
})
hl.curve("linear", {
    type = "bezier",
    points = { { 0, 0 }, { 1, 1 } },
})
hl.curve("almostLinear", {
    type = "bezier",
    points = { { 0.5, 0.5 }, { 0.75, 1 } },
})
hl.curve("quick", {
    type = "bezier",
    points = { { 0.15, 0 }, { 0.1, 1 } },
})

hl.animation({ leaf = "global", enabled = true, speed = 10, bezier = "default" })
hl.animation({ leaf = "border", enabled = true, speed = 5.39, bezier = "easeOutQuint" })
hl.animation({ leaf = "windows", enabled = true, speed = 4.79, bezier = "easeOutQuint" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 4.1, bezier = "easeOutQuint", style = "popin 87%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 1.49, bezier = "linear", style = "popin 87%" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 1.73, bezier = "almostLinear" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 1.46, bezier = "almostLinear" })
hl.animation({ leaf = "fade", enabled = true, speed = 3.03, bezier = "quick" })
hl.animation({ leaf = "layers", enabled = true, speed = 3.81, bezier = "easeOutQuint" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "easeOutQuint", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 1.5, bezier = "linear", style = "fade" })
hl.animation({ leaf = "fadeLayersIn", enabled = true, speed = 1.79, bezier = "almostLinear" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 1.39, bezier = "almostLinear" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "almostLinear", style = "slide" })
hl.animation({ leaf = "workspacesIn", enabled = true, speed = 1.21, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "zoomFactor", enabled = true, speed = 7, bezier = "quick" })

-------------
--- Input ---
-------------

hl.config({
    input = {
        kb_layout = "pt",
        kb_variant = "",
        kb_model = "pc105",
        kb_options = "",
        kb_rules = "",
        follow_mouse = 2,
    },

    gestures = {
        -- Workspace creation is handled by controls bounded to each 10-slot bank.
        workspace_swipe_create_new = false,
    },
})

hl.gesture({
    fingers = 3,
    direction = "horizontal",
    action = "workspace",
})

hl.device({
    name = "epic-mouse-v1",
    sensitivity = -0.5,
})

-------------------
--- Keybindings ---
-------------------

local main_mod = "SUPER"

-- Launch applications and desktop actions.
hl.bind(main_mod .. " + C", hl.dsp.exec_cmd(terminal))
hl.bind(main_mod .. " + B", hl.dsp.exec_cmd("firefox"))
hl.bind(main_mod .. " + E", hl.dsp.exec_cmd(file_manager))
hl.bind(main_mod .. " + SPACE", hl.dsp.exec_cmd(menu))
hl.bind(main_mod .. " + L", hl.dsp.exec_cmd("~/.config/hypr/scripts/idle-guard.sh lock"))
hl.bind(main_mod .. " + M", hl.dsp.exec_cmd("ags request wallpaper-picker"))
hl.bind("Print", hl.dsp.exec_cmd("hyprshot -m region"))

hl.bind(main_mod .. " + SHIFT + R", hl.dsp.exec_cmd(
    [[sh -lc 'ags quit >/dev/null 2>&1; GSK_RENDERER=cairo DRI_PRIME=0 __NV_PRIME_RENDER_OFFLOAD=0 ags run ~/.config/ags/app.ts; hyprctl reload']]
))

-- Core window actions.
hl.bind(main_mod .. " + Q", hl.dsp.window.close())
hl.bind(main_mod .. " + DELETE", hl.dsp.exit())
hl.bind(main_mod .. " + TAB", hl.dsp.window.float({ action = "toggle" }))
hl.bind("ALT + TAB", hl.dsp.window.cycle_next())
hl.bind("ALT + SHIFT + TAB", hl.dsp.window.cycle_next({ next = false }))
hl.bind(main_mod .. " + F", hl.dsp.window.fullscreen())

-- Move focus and windows with the arrow keys.
local directions = { "left", "right", "up", "down" }
for _, direction in ipairs(directions) do
    hl.bind(main_mod .. " + " .. direction, hl.dsp.focus({ direction = direction }))
    hl.bind(main_mod .. " + SHIFT + " .. direction, hl.dsp.window.move({ direction = direction }))
end

-- Resolve number-row shortcuts within the active monitor's workspace bank.
local function workspace_for_active_monitor(local_workspace)
    local monitor = hl.get_active_monitor()

    if monitor ~= nil and monitor.name == external_monitor then
        return local_workspace + workspaces_per_monitor
    end

    return local_workspace
end

local function cycle_local_workspace(delta)
    local workspace = hl.get_active_workspace()

    if workspace == nil then
        return
    end

    local monitor = hl.get_active_monitor()
    local offset = monitor ~= nil and monitor.name == external_monitor
        and workspaces_per_monitor
        or 0
    local local_workspace = ((workspace.id - offset - 1 + delta) % workspaces_per_monitor) + 1

    hl.dispatch(hl.dsp.focus({ workspace = local_workspace + offset }))
end

-- Switch local workspaces and move the active window with the number row.
for workspace = 1, workspaces_per_monitor do
    local local_workspace = workspace
    local key = local_workspace % 10

    hl.bind(main_mod .. " + " .. key, function()
        hl.dispatch(hl.dsp.focus({
            workspace = workspace_for_active_monitor(local_workspace),
        }))
    end)

    hl.bind(main_mod .. " + SHIFT + " .. key, function()
        hl.dispatch(hl.dsp.window.move({
            workspace = workspace_for_active_monitor(local_workspace),
        }))
    end)
end

-- Special workspace (scratchpad).
hl.bind(main_mod .. " + S", hl.dsp.workspace.toggle_special("magic"))
hl.bind(main_mod .. " + SHIFT + S", hl.dsp.window.move({ workspace = "special:magic" }))

-- Scroll workspaces.
hl.bind(main_mod .. " + mouse_down", function()
    cycle_local_workspace(1)
end)
hl.bind(main_mod .. " + mouse_up", function()
    cycle_local_workspace(-1)
end)

-- Move and resize windows with the mouse.
hl.bind(main_mod .. " + mouse:272", hl.dsp.window.drag(), { mouse = true })
hl.bind(main_mod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- Laptop multimedia keys.
local repeat_locked = { locked = true, repeating = true }
hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("wpctl set-volume -l 1.5 @DEFAULT_AUDIO_SINK@ 5%+"), repeat_locked)
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"), repeat_locked)
hl.bind("XF86AudioMute", hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"), repeat_locked)
hl.bind("XF86AudioMicMute", hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle"), repeat_locked)
hl.bind("XF86MonBrightnessUp", hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%+"), repeat_locked)
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%-"), repeat_locked)

local locked = { locked = true }
hl.bind("XF86AudioNext", hl.dsp.exec_cmd("playerctl next"), locked)
hl.bind("XF86AudioPause", hl.dsp.exec_cmd("playerctl play-pause"), locked)
hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("playerctl play-pause"), locked)
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("playerctl previous"), locked)

--------------------
--- Window rules ---
--------------------

hl.window_rule({
    name = "suppress-maximize-events",
    match = { class = ".*" },
    suppress_event = "maximize",
})

hl.window_rule({
    name = "fix-xwayland-drags",
    match = {
        class = "^$",
        title = "^$",
        xwayland = true,
        float = true,
        fullscreen = false,
        pin = false,
    },
    no_initial_focus = true,
})
