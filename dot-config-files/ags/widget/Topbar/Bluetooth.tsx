import AstalBluetooth from "gi://AstalBluetooth"
import Gtk from "gi://Gtk?version=4.0"
import Pango from "gi://Pango?version=1.0"
import { createBinding, createComputed, For, type Accessor } from "gnim"
import BoxIcon from "../Common/BoxIcon"

type BluetoothDevice = any
type BluetoothAdapter = any

function getDeviceName(device: BluetoothDevice): string {
    return device.alias || device.name || device.address || "Unknown device"
}

function sortDevices(devices: BluetoothDevice[]): BluetoothDevice[] {
    return [...devices].sort((a, b) => {
        const aPriority = Number(Boolean(a.connected)) * 2 + Number(Boolean(a.paired))
        const bPriority = Number(Boolean(b.connected)) * 2 + Number(Boolean(b.paired))

        if (aPriority !== bPriority) {
            return bPriority - aPriority
        }

        return getDeviceName(a).localeCompare(getDeviceName(b))
    })
}

function finishAsyncDeviceAction(
    device: BluetoothDevice,
    action: "connect" | "disconnect",
    result: unknown,
) {
    try {
        if (action === "connect") {
            device.connect_device_finish(result)
            return
        }

        device.disconnect_device_finish(result)
    } catch (error) {
        console.error(`Bluetooth ${action} failed`, error)
    }
}

function toggleDeviceConnection(device: BluetoothDevice) {
    try {
        if (device.connected) {
            device.disconnect_device((_source: BluetoothDevice, result: unknown) =>
                finishAsyncDeviceAction(device, "disconnect", result),
            )
            return
        }

        if (!device.paired) {
            device.pair()
        }

        device.connect_device((_source: BluetoothDevice, result: unknown) =>
            finishAsyncDeviceAction(device, "connect", result),
        )
    } catch (error) {
        console.error("Bluetooth device action failed", error)
    }
}

function startDiscovery(adapter: BluetoothAdapter | null | undefined) {
    if (!adapter?.powered || adapter.discovering) {
        return
    }

    try {
        adapter.start_discovery()
    } catch (error) {
        console.error("Bluetooth discovery failed", error)
    }
}

function setAdapterPowered( adapter: BluetoothAdapter | null | undefined, powered: boolean) {
    if (!adapter) {
        return
    }

    try {
        adapter.set_powered(powered)
    } catch (error) {
        console.error("Bluetooth power toggle failed", error)
    }
}

function BluetoothDeviceRow({ device }: { device: BluetoothDevice }) {
    const alias = createBinding(device, "alias")
    const name = createBinding(device, "name")
    const address = createBinding(device, "address")
    const paired = createBinding(device, "paired")
    const connected = createBinding(device, "connected")
    const connecting = createBinding(device, "connecting")
    const batteryPercentage = createBinding(device, "battery-percentage")

    const displayName = createComputed(() => alias() || name() || address() || "Unknown device")
    const status = createComputed(() => {
        if (connecting()) return "Connecting"
        if (connected()) return "Connected"
        if (paired()) return "Paired"
        return "Available"
    })
    const buttonClass = createComputed(() => {
        if (!paired()) {
            return "bluetoothDeviceRow bluetoothDeviceRowUnpaired"
        }

        if (connected()) {
            return "popoverMenuAction bluetoothDeviceRow btnHovered"
        }

        return "popoverMenuAction bluetoothDeviceRow"
    })
    const isPairedOnly = createComputed(() => paired() && !connected())
    const batteryLabel = createComputed(() => {
        const value = Number(batteryPercentage())

        if (!Number.isFinite(value) || value < 0) {
            return ""
        }

        return `${Math.round(value * 100)}%`
    })

    return (
        <button
            class={buttonClass}
            hexpand
            onClicked={() => toggleDeviceConnection(device)}
            $={(button) => button.set_cursor_from_name("pointer")}
        >
            <box
                spacing={10}
                hexpand
            >
                <BoxIcon
                    name="bluetooth"
                    size={16}
                    class="icon"
                />

                <box
                    orientation={Gtk.Orientation.VERTICAL}
                    spacing={2}
                    hexpand
                    valign={Gtk.Align.CENTER}
                >
                    <label
                        class="bluetoothDeviceName"
                        label={displayName}
                        ellipsize={Pango.EllipsizeMode.END}
                        maxWidthChars={25}
                        halign={Gtk.Align.START}
                        xalign={0}
                    />

                    <label
                        class="bluetoothDeviceStatus"
                        label={status}
                        halign={Gtk.Align.START}
                        xalign={0}
                    />
                </box>

                <label
                    class="bluetoothDeviceBattery"
                    label={batteryLabel}
                    visible={batteryLabel((value) => value.length > 0)}
                    valign={Gtk.Align.CENTER}
                />

                <box visible={connecting}>
                    <BoxIcon
                        name="loader"
                        size={16}
                        class="bluetoothDeviceStateIcon icon"
                    />
                </box>

                <box visible={connected}>
                    <BoxIcon
                        name="check"
                        size={16}
                        class="bluetoothDeviceStateIcon icon"
                    />
                </box>

                <box visible={isPairedOnly}>
                    <BoxIcon
                        name="save"
                        size={16}
                        class="bluetoothDeviceStateIcon icon"
                    />
                </box>
            </box>
        </button>
    )
}

export default function Bluetooth() {
    const bluetooth = AstalBluetooth.get_default()
    const adapter = createBinding(bluetooth, "adapter")
    const isPowered = createBinding(bluetooth, "is-powered")
    const devices = createBinding(bluetooth, "devices").as((devices) =>
        sortDevices(Array.from(devices ?? []) as BluetoothDevice[]),
    )
    const hasDevices = devices((items) => items.length > 0)

    return (
        <menubutton
            class="bluetoothButton"
            $={(button) => {
                button.set_cursor_from_name("pointer")
                button.connect("notify::active", () => {
                    if (button.active) {
                        startDiscovery(adapter())
                    }
                })
            }}
        >
            <BoxIcon
                name="bluetooth"
                size={18}
                class="icon"
            />

            <popover hasArrow={false}>
                <box
                    class="bluetoothPopoverContent"
                    orientation={Gtk.Orientation.VERTICAL}
                    spacing={12}
                >
                    <box
                        class="bluetoothHeader"
                        spacing={10}
                    >
                        <label
                            class="bluetoothPopoverTitle"
                            label="Bluetooth"
                            hexpand
                            halign={Gtk.Align.START}
                            xalign={0}
                        />

                        <switch
                            class="bluetoothSwitch"
                            active={isPowered}
                            sensitive={adapter((value) => Boolean(value))}
                            $={(sw) => {
                                sw.set_cursor_from_name("pointer")
                                sw.connect("state-set", (_switch, state: boolean) => {
                                    setAdapterPowered(adapter(), state)
                                    return false
                                })
                            }}
                        />
                    </box>

                    <label
                        class="bluetoothEmpty"
                        label="No Bluetooth adapter"
                        visible={adapter((value) => !value)}
                    />

                    <scrolledwindow
                        class="bluetoothDeviceScroller"
                        hscrollbarPolicy={Gtk.PolicyType.NEVER}
                        vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                        visible={adapter((value) => Boolean(value))}
                        vexpand
                    >
                        <box
                            class="bluetoothDeviceRows"
                            orientation={Gtk.Orientation.VERTICAL}
                            spacing={6}
                        >
                            <For each={devices}>
                                {(device) => <BluetoothDeviceRow device={device} />}
                            </For>

                            <label
                                class="bluetoothEmpty"
                                label={isPowered((powered) =>
                                    powered ? "Searching for devices" : "Bluetooth is off",
                                )}
                                visible={hasDevices((value) => !value)}
                            />
                        </box>
                    </scrolledwindow>
                </box>
            </popover>
        </menubutton>
    )
}
