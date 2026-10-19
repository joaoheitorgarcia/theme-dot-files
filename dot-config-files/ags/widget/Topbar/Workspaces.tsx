import AstalHyprland from "gi://AstalHyprland"
import { createBinding, createConnection, For } from "gnim"

type Workspace = {
    id: number
    name?: string
    monitor?: Monitor | null
}

type Monitor = {
    name?: string
    activeWorkspace?: Workspace | null
    specialWorkspace?: Workspace | null
}

type WorkspacesProps = {
    monitorName: string
}

const WORKSPACES_PER_MONITOR = 10
const EXTERNAL_MONITOR = "HDMI-A-1"

function workspaceId(workspace: Workspace) {
    return Number(workspace.id) || 0
}

function specialWorkspaceName(workspace: Workspace) {
    return workspace.name?.replace(/^special:/, "") || "magic"
}

function monitorWorkspaceOffset(monitorName: string) {
    return monitorName === EXTERNAL_MONITOR ? WORKSPACES_PER_MONITOR : 0
}

function belongsToMonitor(workspace: Workspace, monitorName: string) {
    const id = workspaceId(workspace)

    if (id < 0) {
        return workspace.monitor?.name === monitorName
    }

    const offset = monitorWorkspaceOffset(monitorName)
    return id > offset && id <= offset + WORKSPACES_PER_MONITOR
}

function localWorkspaceId(workspace: Workspace, monitorName: string) {
    return workspaceId(workspace) - monitorWorkspaceOffset(monitorName)
}

export default function Workspaces({ monitorName }: WorkspacesProps) {
    const hyprland = AstalHyprland.get_default()

    if (!hyprland) {
        return <box />
    }

    const workspaces = createBinding(hyprland, "workspaces").as((workspaces) =>
        (Array.from(workspaces ?? []) as Workspace[])
            .filter((workspace) => belongsToMonitor(workspace, monitorName))
            .sort((a, b) => workspaceId(a) - workspaceId(b)),
    )

    function getActiveWorkspaceId() {
        const monitor = (Array.from(hyprland.monitors ?? []) as Monitor[])
            .find((candidate) => candidate.name === monitorName)
        const specialWorkspaceId = workspaceId(monitor?.specialWorkspace ?? { id: 0 })

        if (specialWorkspaceId < 0) {
            return specialWorkspaceId
        }

        return workspaceId(monitor?.activeWorkspace ?? { id: 0 })
    }

    const activeWorkspaceId = createConnection(
        getActiveWorkspaceId(),
        [hyprland, "event", getActiveWorkspaceId],
    )

    function focusWorkspace(id: number, specialName: string) {
        if (id > 0) {
            hyprland.dispatch(`hl.dsp.focus({ workspace = ${id} })`, "")
        } else {
            const name = specialName.length > 0 ? specialName : "magic"
            hyprland.dispatch(
                `hl.dsp.workspace.toggle_special(${JSON.stringify(name)})`,
                "",
            )
        }
    }

    return (
        <box>
            <For each={workspaces} id={(workspace) => workspaceId(workspace)}>
                {(workspace) => {
                    const id = workspaceId(workspace)
                    const specialName = specialWorkspaceName(workspace)

                    return (
                        <button
                            class={activeWorkspaceId((activeId) =>
                                id === activeId
                                    ? "workspaceBtn btnHovered"
                                    : "workspaceBtn"
                            )}
                            $={(button) => button.set_cursor_from_name("pointer")}
                            onClicked={() => focusWorkspace(id, specialName)}
                        >
                            <label
                                label={id > 0
                                    ? String(localWorkspaceId(workspace, monitorName))
                                    : "S"}
                            />
                        </button>
                    )
                }}
            </For>
        </box>
    )
}
