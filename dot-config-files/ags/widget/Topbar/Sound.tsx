import AstalWp from "gi://AstalWp"
import Gtk from "gi://Gtk?version=4.0"
import Pango from "gi://Pango?version=1.0"
import { createBinding, createComputed, createState, For, type Accessor } from "gnim"
import BoxIcon from "../Common/BoxIcon"

type AudioNode = any
type MonitorGeometry = { height?: number }
type SoundProps = {
    gdkmonitor?: { geometry?: MonitorGeometry }
}

const wireplumber = AstalWp.get_default()
const audio = wireplumber.audio

const [showApplications, setShowApplications] = createState(true)
const [showOutputs, setShowOutputs] = createState(false)
const [showInputs, setShowInputs] = createState(false)

let previousVolume = 0.5
let previousInputVolume = 0.5

const MAX_PLAYBACK_VOLUME = 1.5
const MAX_INPUT_VOLUME = 1

function clampVolume(value: number, max = MAX_PLAYBACK_VOLUME) {
    return Math.max(0, Math.min(max, value))
}

function nodeName(node: AudioNode) {
    return node.description || node.name || "Unknown"
}

function sortNodes(nodes: AudioNode[]) {
    return [...nodes].sort((a, b) => {
        const aDefault = Number(Boolean(a.is_default))
        const bDefault = Number(Boolean(b.is_default))

        if (aDefault !== bDefault) {
            return bDefault - aDefault
        }

        return nodeName(a).localeCompare(nodeName(b))
    })
}

function getVolumeIcon(value: number, muted = false) {
    if (muted || value <= 0) return "volume-mute"
    if (value < 0.33) return "volume-low"
    if (value < 0.66) return "volume"
    return "volume-full"
}

function setNodeVolume(
    node: AudioNode | null | undefined,
    value: number,
    unmute = false,
    max = MAX_PLAYBACK_VOLUME,
) {
    if (!node) {
        return
    }

    node.volume = clampVolume(value, max)

    if (unmute && node.mute) {
        node.mute = false
    }
}

function toggleNodeMute(node: AudioNode | null | undefined) {
    if (!node) {
        return
    }

    node.mute = !node.mute
}

function setDefaultNode(node: AudioNode) {
    node.is_default = true
}

function VolumeSlider({
    value,
    max = MAX_PLAYBACK_VOLUME,
    onChange,
}: {
    value: Accessor<number>
    max?: number
    onChange: (value: number) => void
}) {
    return (
        <slider
            class="soundSlider"
            min={0}
            max={max}
            step={0.01}
            value={value}
            hexpand
            onNotifyValue={(slider) => {
                if (Math.abs(value() - slider.value) > 0.001) {
                    onChange(slider.value)
                }
            }}
            $={(slider) => slider.set_cursor_from_name("pointer")}
        />
    )
}

function SectionHeader({
    label,
    expanded,
    onClicked,
}: {
    label: string
    expanded: Accessor<boolean>
    onClicked: () => void
}) {
    return (
        <button
            class="soundSectionHeader"
            hexpand
            onClicked={onClicked}
            $={(button) => button.set_cursor_from_name("pointer")}
        >
            <box
                spacing={6}
                hexpand
            >
                <label
                    class="soundSectionTitle"
                    label={label}
                    hexpand
                    halign={Gtk.Align.START}
                    xalign={0}
                />

                <BoxIcon
                    name={expanded((value) => value ? "chevron-up" : "chevron-down")}
                    size={16}
                    class="icon"
                />
            </box>
        </button>
    )
}

function MainVolumeRow({
    icon,
    value,
    max = MAX_PLAYBACK_VOLUME,
    onChange,
    onToggleMute,
}: {
    icon: Accessor<string>
    value: Accessor<number>
    max?: number
    onChange: (value: number) => void
    onToggleMute: () => void
}) {
    const label = createComputed(() => `${Math.round(value() * 100)}%`)

    return (
        <box
            class="soundVolumeRow"
            spacing={10}
        >
            <button
                class="soundIconButton"
                onClicked={onToggleMute}
                $={(button) => button.set_cursor_from_name("pointer")}
            >
                <BoxIcon
                    name={icon}
                    size={22}
                    class="icon"
                />
            </button>

            <VolumeSlider
                value={value}
                max={max}
                onChange={onChange}
            />

            <label
                class="soundPercent"
                label={label}
                widthRequest={42}
                xalign={1}
            />
        </box>
    )
}

function ApplicationRow({ item }: { item: AudioNode }) {
    const name = createBinding(item, "name")
    const description = createBinding(item, "description")
    const value = createBinding(item, "volume").as((value) =>
        clampVolume(Number(value) || 0, MAX_PLAYBACK_VOLUME),
    )
    const muted = createBinding(item, "mute")
    const icon = createComputed(() => getVolumeIcon(value(), muted()))
    const percent = createComputed(() => `${Math.round(value() * 100)}%`)
    const label = createComputed(() => description() || name() || "Unknown")

    return (
        <box
            class="soundApplicationRow"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={4}
        >
            <label
                class="soundApplicationName"
                label={label}
                ellipsize={Pango.EllipsizeMode.END}
                maxWidthChars={30}
                halign={Gtk.Align.START}
                xalign={0}
            />

            <box spacing={8}>
                <button
                    class="soundIconButton"
                    onClicked={() => toggleNodeMute(item)}
                    $={(button) => button.set_cursor_from_name("pointer")}
                >
                    <BoxIcon
                        name={icon}
                        size={18}
                        class="icon"
                    />
                </button>

                <VolumeSlider
                    value={value}
                    onChange={(value) => setNodeVolume(item, value, true)}
                />

                <label
                    class="soundPercent"
                    label={percent}
                    widthRequest={42}
                    xalign={1}
                />
            </box>
        </box>
    )
}

function DeviceRow({ item }: { item: AudioNode }) {
    const name = createBinding(item, "name")
    const description = createBinding(item, "description")
    const isDefault = createBinding(item, "is-default")
    const label = createComputed(() => description() || name() || "Unknown")
    const buttonClass = createComputed(() =>
        isDefault()
            ? "popoverMenuAction soundDeviceRow btnHovered"
            : "popoverMenuAction soundDeviceRow",
    )

    return (
        <button
            class={buttonClass}
            onClicked={() => setDefaultNode(item)}
            $={(button) => button.set_cursor_from_name("pointer")}
        >
            <box spacing={8}>
                <label
                    class="soundDeviceName"
                    label={label}
                    ellipsize={Pango.EllipsizeMode.END}
                    maxWidthChars={30}
                    hexpand
                    halign={Gtk.Align.START}
                    xalign={0}
                />

                <box visible={isDefault}>
                    <BoxIcon
                        name="check"
                        size={16}
                        class="icon"
                    />
                </box>
            </box>
        </button>
    )
}

function DeviceScroller({
    items,
    emptyLabel,
    emptyVisible,
    visible,
    maxHeight,
}: {
    items: Accessor<AudioNode[]>
    emptyLabel: string
    emptyVisible: Accessor<boolean>
    visible: Accessor<boolean>
    maxHeight: number
}) {
    return (
        <scrolledwindow
            class="soundDeviceScroller"
            maxContentHeight={maxHeight}
            minContentHeight={56}
            propagateNaturalHeight
            hscrollbarPolicy={Gtk.PolicyType.NEVER}
            vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
            visible={visible}
        >
            <box
                class="soundDeviceRows"
                orientation={Gtk.Orientation.VERTICAL}
                spacing={6}
            >
                <For each={items}>
                    {(item) => <DeviceRow item={item} />}
                </For>

                <label
                    class="soundEmpty"
                    label={emptyLabel}
                    visible={emptyVisible}
                />
            </box>
        </scrolledwindow>
    )
}

export default function Sound({ gdkmonitor }: SoundProps = {}) {
    const deviceMenuMaxHeight = Math.max(
        160,
        Math.floor((gdkmonitor?.geometry?.height ?? 960) * 0.45),
    )
    const defaultSpeaker = createBinding(audio, "default-speaker")
    const defaultMicrophone = createBinding(audio, "default-microphone")
    const volume = createBinding(audio, "default-speaker", "volume")
        .as((value) => clampVolume(Number(value) || 0))
    const muted = createBinding(audio, "default-speaker", "mute")
    const inputVolume = createBinding(audio, "default-microphone", "volume")
        .as((value) => clampVolume(Number(value) || 0, MAX_INPUT_VOLUME))
    const inputMuted = createBinding(audio, "default-microphone", "mute")
    const applications = createBinding(audio, "streams")
        .as((streams) => Array.from(streams ?? []) as AudioNode[])
    const outputs = createBinding(audio, "speakers")
        .as((speakers) => sortNodes(Array.from(speakers ?? []) as AudioNode[]))
    const inputs = createBinding(audio, "microphones")
        .as((microphones) => sortNodes(Array.from(microphones ?? []) as AudioNode[]))
    const outputIcon = createComputed(() => getVolumeIcon(volume(), muted()))
    const inputIcon = createComputed(() =>
        inputMuted() || inputVolume() <= 0 ? "microphone-slash" : "microphone",
    )
    const applicationCount = applications((items) => items.length)
    const outputCount = outputs((items) => items.length)
    const inputCount = inputs((items) => items.length)

    return (
        <menubutton
            class="soundButton"
            $={(button) => button.set_cursor_from_name("pointer")}
        >
            <BoxIcon
                name={outputIcon}
                size={18}
                class="icon"
            />

            <popover hasArrow={false}>
                <box
                    class="soundPopoverContent"
                    orientation={Gtk.Orientation.VERTICAL}
                    spacing={12}
                >
                    <label
                        class="soundPopoverTitle"
                        label="Audio"
                        halign={Gtk.Align.START}
                        xalign={0}
                    />

                    <MainVolumeRow
                        icon={outputIcon}
                        value={volume}
                        onChange={(value) => setNodeVolume(defaultSpeaker(), value)}
                        onToggleMute={() => {
                            if (muted()) {
                                toggleNodeMute(defaultSpeaker())
                            } else if (volume() > 0) {
                                previousVolume = volume()
                                setNodeVolume(defaultSpeaker(), 0)
                            } else {
                                setNodeVolume(defaultSpeaker(), previousVolume || 0.5)
                            }
                        }}
                    />

                    <MainVolumeRow
                        icon={inputIcon}
                        value={inputVolume}
                        max={MAX_INPUT_VOLUME}
                        onChange={(value) =>
                            setNodeVolume(defaultMicrophone(), value, false, MAX_INPUT_VOLUME)
                        }
                        onToggleMute={() => {
                            if (inputMuted()) {
                                toggleNodeMute(defaultMicrophone())
                            } else if (inputVolume() > 0) {
                                previousInputVolume = inputVolume()
                                setNodeVolume(defaultMicrophone(), 0)
                            } else {
                                setNodeVolume(defaultMicrophone(), previousInputVolume || 0.5)
                            }
                        }}
                    />

                    <SectionHeader
                        label="Applications"
                        expanded={showApplications}
                        onClicked={() => setShowApplications((value) => !value)}
                    />

                    <scrolledwindow
                        class="soundApplicationScroller"
                        maxContentHeight={deviceMenuMaxHeight}
                        minContentHeight={56}
                        propagateNaturalHeight
                        hscrollbarPolicy={Gtk.PolicyType.NEVER}
                        vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                        visible={showApplications}
                    >
                        <box
                            class="soundApplicationRows"
                            orientation={Gtk.Orientation.VERTICAL}
                            spacing={6}
                        >
                            <For each={applications}>
                                {(item) => <ApplicationRow item={item} />}
                            </For>

                            <label
                                class="soundEmpty"
                                label="No application audio"
                                visible={applicationCount((value) => value === 0)}
                            />
                        </box>
                    </scrolledwindow>

                    <SectionHeader
                        label="Output"
                        expanded={showOutputs}
                        onClicked={() => setShowOutputs((value) => !value)}
                    />

                    <DeviceScroller
                        items={outputs}
                        emptyLabel="No outputs"
                        emptyVisible={outputCount((value) => value === 0)}
                        visible={showOutputs}
                        maxHeight={deviceMenuMaxHeight}
                    />

                    <SectionHeader
                        label="Input"
                        expanded={showInputs}
                        onClicked={() => setShowInputs((value) => !value)}
                    />

                    <DeviceScroller
                        items={inputs}
                        emptyLabel="No inputs"
                        emptyVisible={inputCount((value) => value === 0)}
                        visible={showInputs}
                        maxHeight={deviceMenuMaxHeight}
                    />
                </box>
            </popover>
        </menubutton>
    )
}
