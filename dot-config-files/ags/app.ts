import GLib from "gi://GLib?version=2.0"
import app from "ags/gtk4/app"
import style from "./style.scss"
import Topbar from "./widget/Topbar"
import Background from "./widget/Background"
import Notifications from "./widget/Notification/Notifications"
import AppMenu from "./widget/AppMenu"
import WallpaperPicker, { toggleWallpaperPicker } from "./widget/WallpaperPicker"

let restartSource = 0

function launchHyprlock() {
  try {
    GLib.spawn_command_line_async("hyprlock --immediate-render --no-fade-in")
    return true
  } catch (error) {
    console.error("Failed to launch hyprlock", error)
    return false
  }
}

function createWindows() {
  const monitors = app.get_monitors()

  monitors.forEach(Background)
  monitors.forEach(Topbar)

  const primaryMonitor = monitors[0]
  if (!primaryMonitor) {
    return
  }

  const notifications = app.get_window("notifications") as any
  if (notifications) {
    notifications.gdkmonitor = primaryMonitor
  } else {
    Notifications(primaryMonitor)
  }

  if (!app.get_window("appmenu")) {
    AppMenu(primaryMonitor)
  }

  if (!app.get_window("wallpaperpicker")) {
    WallpaperPicker(primaryMonitor)
  }
}

function scheduleRestart() {
  if (restartSource) {
    return
  }

  restartSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
    GLib.spawn_command_line_async("sh -lc 'sleep 0.3; GSK_RENDERER=cairo DRI_PRIME=0 __NV_PRIME_RENDER_OFFLOAD=0 ags run ~/.config/ags/app.ts'")
    app.quit()
    return GLib.SOURCE_REMOVE
  })
}

app.start({
  css: style,

  requestHandler(argv, res) {
    if (argv.includes("lock")) {
      res(launchHyprlock() ? "ok" : "failed")
      return
    }

    if (argv.includes("wallpaper-picker")) {
      toggleWallpaperPicker()
      res("ok")
      return
    }

    res(`unknown request: ${argv.join(" ")}`)
  },

  main() {
    createWindows()
    app.connect("notify::monitors", scheduleRestart)
  },
})
