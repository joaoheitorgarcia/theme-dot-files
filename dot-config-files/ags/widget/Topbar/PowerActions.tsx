import { Gtk } from "ags/gtk4"
import BoxIcon from "../Common/BoxIcon"
import { runCommand } from "../Common/RunCommand"

type PowerAction = {
    label: string
    icon: string
    command?: string[]
    action?: () => void
}

const actions: PowerAction[] = [
    { label: "Lock", icon: "lock", command: ["hyprlock", "--immediate-render", "--no-fade-in"] },
    { label: "Sleep", icon: "leaf", command: ["systemctl", "suspend"] },
    { label: "Reboot", icon: "redo", command: ["reboot"] },
    { label: "Shut Down", icon: "power", command: ["shutdown", "now"] },
]


export default function PowerActions() {
    let popover: Gtk.Popover | undefined

    return (
        <menubutton
            class="powerMenu"
            $={(button) => button.set_cursor_from_name("pointer")}
        >
            <BoxIcon
                name="power"
                size={18}
                class="icon"
            />
            <popover
                hasArrow={false}
                $={(widget) => {
                    popover = widget
                }}
            >
                <box
                    orientation={Gtk.Orientation.VERTICAL}
                    class="popoverContent"
                    spacing={6}
                >
                    {actions.map((action) => (
                        <button
                            $={(button) => button.set_cursor_from_name("pointer")}
                            class="popoverMenuAction"
                            onClicked={() => {
                                popover?.popdown()
                                if (action.action) {
                                    action.action()
                                    return
                                }

                                if (action.command) {
                                    runCommand(action.command)
                                }
                            }}
                        >
                            <box
                                spacing={10}
                                hexpand
                            >
                                <BoxIcon
                                    name={action.icon}
                                    size={16}
                                    class="icon"
                                />
                                <label
                                    label={action.label}
                                    hexpand
                                    halign={Gtk.Align.START}
                                />
                            </box>
                        </button>
                    ))}
                </box>
            </popover>
        </menubutton>
    )
}
