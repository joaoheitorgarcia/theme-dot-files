import { Gtk } from "ags/gtk4"
import app from "ags/gtk4/app"
import { Astal, Gdk } from "ags/gtk4"
import DateTime from "./Topbar/DateTime"
import LockToggle from "./Topbar/LockToggle"
import NotificationList from "./Topbar/NotificationList"
import Workspaces from "./Topbar/Workspaces"
import PowerActions from "./Topbar/PowerActions"
import BatteryInfo from "./Topbar/BatteryInfo"
import Bluetooth from "./Topbar/Bluetooth"
import Sound from "./Topbar/Sound"
import Network from "./Topbar/Network"
import AppTray from "./Topbar/AppTray"
import { monitorId } from "./Common/Monitor"

export default function Topbar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor
  const id = monitorId(gdkmonitor)
  const monitorName = String(gdkmonitor.get_connector?.() ?? gdkmonitor.connector ?? "").trim()

  return (
    <window
      name={`topbar-${id}`}
      class="Topbar"
      $={(win) => {
        win.namespace = `ags-topbar-${id}`
        win.gdkmonitor = gdkmonitor
        win.exclusivity = Astal.Exclusivity.EXCLUSIVE
        win.anchor = TOP | LEFT | RIGHT
        win.layer = Astal.Layer.TOP
        win.application = app
        win.visible = true
      }}
    >
      <centerbox
        cssName="centerbox"
        hexpand
        halign={Gtk.Align.FILL}
      >
        {/* START */}
        <box
          $type="start"
          class="topbarStart"
        >
          <Workspaces monitorName={monitorName} />
        </box>
    
        {/* END */}
        <box
          $type="end"
          class="topbarEnd"
        >
          <box
            class="topbarAppBar"
          >
            <AppTray/>
          </box>
          <box
            class="topbarUtilsSection"
          >
            <LockToggle />
            <NotificationList />
            <DateTime />
            <Bluetooth />
            <Sound gdkmonitor={gdkmonitor} />
            <Network />
            <BatteryInfo/>
            <PowerActions /> 
          </box>
        </box>
      </centerbox>
    </window>
  )
}
