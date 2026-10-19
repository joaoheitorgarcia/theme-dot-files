import Gio from "gi://Gio"
import GLib from "gi://GLib?version=2.0"
import GdkPixbuf from "gi://GdkPixbuf?version=2.0"
import Pango from "gi://Pango?version=1.0"
import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createComputed, createState, For } from "gnim"
import {
  currentBackgroundPath,
  listBackgrounds,
  selectBackground,
  type BackgroundEntry,
} from "./Common/BackgroundState"

type MatugenMode = "light" | "dark"
type MatugenPrefer =
  | "darkness"
  | "lightness"
  | "saturation"
  | "less-saturation"
  | "value"
  | "closest-to-fallback"
type ActiveControl = "wallpapers" | "prefer"

type ThemePreviewColors = {
  surface: string
  surfaceDim: string
  surfaceBright: string
  onSurface: string
  onSurfaceVariant: string
  primary: string
  onPrimary: string
  secondary: string
  onSecondary: string
  outline: string
  error: string
}

type CachedThemePreview = {
  mode: MatugenMode
  colors: ThemePreviewColors
}

const preferOptions: { id: MatugenPrefer; label: string }[] = [
  { id: "saturation", label: "Saturation" },
  { id: "less-saturation", label: "Muted" },
  { id: "darkness", label: "Dark" },
  { id: "lightness", label: "Light" },
  { id: "value", label: "Value" },
  { id: "closest-to-fallback", label: "Fallback" },
]

const [backgrounds, setBackgrounds] = createState<BackgroundEntry[]>([])
const [selectedIndex, setSelectedIndex] = createState(0)
const [selectedPrefer, setSelectedPrefer] = createState<MatugenPrefer>("saturation")
const [activeControl, setActiveControl] = createState<ActiveControl>("wallpapers")
const [matugenPreferOptions] = createState(preferOptions)
const [themePreview, setThemePreview] = createState<ThemePreviewColors>(fallbackThemePreview())
const [thumbnailPaths, setThumbnailPaths] = createState<Record<string, string>>({})
const selectedBackground = createComputed(() => backgrounds()[selectedIndex()] ?? null)
const indexedBackgrounds = createComputed(() =>
  backgrounds().map((entry, index) => ({ ...entry, index })),
)

let wallpaperScroller: Gtk.ScrolledWindow | null = null
let themePreviewSource = 0
let themePreviewRequest = 0
let themePreviewProcess: Gio.Subprocess | null = null
let themePreviewCancellable: Gio.Cancellable | null = null

const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "ags", "wallpaper-picker"])
const thumbnailDir = GLib.build_filenamev([cacheDir, "thumbnails"])
const pendingThumbnailPath = GLib.build_filenamev([cacheDir, "pending-thumbnail"])
const themePreviewCachePath = GLib.build_filenamev([cacheDir, "theme-previews.json"])
const queuedThumbnails = new Set<string>()
const thumbnailQueue: { entry: BackgroundEntry; target: string }[] = []
let thumbnailProcessRunning = false
const themePreviewCache = loadThemePreviewCache()

function fallbackThemePreview(): ThemePreviewColors {
  return {
    surface: "#19120c",
    surfaceDim: "#19120c",
    surfaceBright: "#413730",
    onSurface: "#efe0d5",
    onSurfaceVariant: "#d6c3b6",
    primary: "#ffb778",
    onPrimary: "#4c2700",
    secondary: "#e2c0a5",
    onSecondary: "#412c19",
    outline: "#9e8e82",
    error: "#ffb4ab",
  }
}

function decodeContents(contents: unknown) {
  if (typeof contents === "string") {
    return contents
  }

  return String.fromCharCode(...(contents as Uint8Array))
}

function imageFingerprint(path: string) {
  try {
    const info = Gio.File.new_for_path(path).query_info(
      `${Gio.FILE_ATTRIBUTE_STANDARD_SIZE},${Gio.FILE_ATTRIBUTE_TIME_MODIFIED}`,
      Gio.FileQueryInfoFlags.NONE,
      null,
    )
    return `${path}:${info.get_size()}:${info.get_attribute_uint64(Gio.FILE_ATTRIBUTE_TIME_MODIFIED)}`
  } catch {
    return path
  }
}

function cacheKey(value: string) {
  return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, value, -1) ?? value
}

function thumbnailPath(entry: BackgroundEntry) {
  return GLib.build_filenamev([thumbnailDir, `${cacheKey(imageFingerprint(entry.path))}.png`])
}

function themeCacheKey(path: string, prefer: MatugenPrefer) {
  return cacheKey(`${imageFingerprint(path)}:${prefer}`)
}

function loadThemePreviewCache(): Record<string, CachedThemePreview> {
  try {
    const [, contents] = Gio.File.new_for_path(themePreviewCachePath).load_contents(null)
    return JSON.parse(decodeContents(contents)) as Record<string, CachedThemePreview>
  } catch {
    return {}
  }
}

function saveThemePreviewCache() {
  try {
    GLib.mkdir_with_parents(cacheDir, 0o755)
    GLib.file_set_contents(themePreviewCachePath, `${JSON.stringify(themePreviewCache)}\n`)
  } catch (error) {
    console.error("Failed to save wallpaper theme preview cache", error)
  }
}

function queueBackgroundThumbnails(entries: BackgroundEntry[]) {
  GLib.mkdir_with_parents(thumbnailDir, 0o755)

  const paths = { ...thumbnailPaths() }
  let pathsChanged = false

  for (const entry of entries) {
    const target = thumbnailPath(entry)

    if (Gio.File.new_for_path(target).query_exists(null)) {
      if (paths[entry.path] !== target) {
        paths[entry.path] = target
        pathsChanged = true
      }
    } else {
      if (paths[entry.path] && paths[entry.path] !== target) {
        delete paths[entry.path]
        pathsChanged = true
      }

      if (!queuedThumbnails.has(target)) {
        queuedThumbnails.add(target)
        thumbnailQueue.push({ entry, target })
      }
    }
  }

  if (pathsChanged) {
    setThumbnailPaths(paths)
  }

  generateNextThumbnail()
}

function generateNextThumbnail() {
  if (thumbnailProcessRunning) {
    return
  }

  const queued = thumbnailQueue.shift()
  if (!queued) {
    return
  }

  thumbnailProcessRunning = true
  const temporary = `${queued.target}.tmp`
  const command = [
    "magick",
    `${queued.entry.path}[0]`,
    "-auto-orient",
    "-thumbnail",
    "600x810",
    "-strip",
    `png:${temporary}`,
  ]

  try {
    const process = Gio.Subprocess.new(
      command,
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_PIPE,
    )

    process.communicate_utf8_async(null, null, (_process, result) => {
      try {
        const [, , stderr] = process.communicate_utf8_finish(result)

        if (!process.get_successful()) {
          console.error(
            `Thumbnail generation failed (${process.get_exit_status()}): ${stderr || command.join(" ")}`,
          )
          return
        }

        Gio.File.new_for_path(temporary).move(
          Gio.File.new_for_path(queued.target),
          Gio.FileCopyFlags.OVERWRITE,
          null,
          null,
        )
        setThumbnailPaths({ ...thumbnailPaths(), [queued.entry.path]: queued.target })
      } catch (error) {
        console.error(`Failed to generate thumbnail for ${queued.entry.path}`, error)
      } finally {
        queuedThumbnails.delete(queued.target)
        thumbnailProcessRunning = false
        generateNextThumbnail()
      }
    })
  } catch (error) {
    console.error(`Failed to start thumbnail generation for ${queued.entry.path}`, error)
    queuedThumbnails.delete(queued.target)
    thumbnailProcessRunning = false
    generateNextThumbnail()
  }
}

function refreshBackgrounds() {
  const entries = listBackgrounds()
  const currentPath = currentBackgroundPath()
  const currentIndex = entries.findIndex((entry) => entry.path === currentPath)

  setBackgrounds(entries)
  queueBackgroundThumbnails(entries)
  setSelectedIndex(currentIndex >= 0 ? currentIndex : entries.length > 0 ? 0 : -1)
  scrollSelectionIntoView(currentIndex >= 0 ? currentIndex : 0)
  scheduleThemePreview()
}

function closePicker() {
  cancelThemePreview()
  const window = app.get_window("wallpaperpicker")

  if (window) {
    window.visible = false
  }
}

function isInsideCssClass(widget: Gtk.Widget | null, className: string) {
  let current = widget

  while (current) {
    if (current.has_css_class(className)) {
      return true
    }

    current = current.get_parent()
  }

  return false
}

export function toggleWallpaperPicker() {
  const window = app.get_window("wallpaperpicker")

  if (window) {
    if (window.visible) {
      closePicker()
    } else {
      window.visible = true
    }
  }
}

function applyBackground(entry: BackgroundEntry | null | undefined) {
  if (!entry) {
    return
  }

  const cached = themePreviewCache[themeCacheKey(entry.path, selectedPrefer())]
  const mode = cached?.mode ?? pickMatugenMode(entry.path)

  selectBackground(entry)
  closePicker()
  runMatugen(entry.path, mode, selectedPrefer())
}

function restartAgs() {
  GLib.spawn_command_line_async("sh -lc 'sleep 0.2; GSK_RENDERER=cairo DRI_PRIME=0 __NV_PRIME_RENDER_OFFLOAD=0 ags run ~/.config/ags/app.ts'")
  app.quit()
}

function runMatugen(path: string, mode: MatugenMode, prefer: MatugenPrefer) {
  const command = ["matugen", "image", path, "-m", mode, "--prefer", prefer]

  try {
    const process = Gio.Subprocess.new(
      command,
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    )

    process.communicate_utf8_async(null, null, (_process, result) => {
      try {
        const [, stdout, stderr] = process.communicate_utf8_finish(result)

        if (!process.get_successful()) {
          console.error(
            `matugen failed (${process.get_exit_status()}): ${stderr || stdout || command.join(" ")}`,
          )
          return
        }

        restartAgs()
      } catch (error) {
        console.error(`Failed to run matugen: ${command.join(" ")}`, error)
      }
    })
  } catch (error) {
    console.error(`Failed to spawn matugen: ${command.join(" ")}`, error)
  }
}

function colorFromMatugenJson(data: any, name: string, fallback: string) {
  return data?.colors?.[name]?.dark?.color ?? data?.colors?.[name]?.default?.color ?? fallback
}

function previewFromMatugenJson(data: any): ThemePreviewColors {
  const fallback = fallbackThemePreview()

  return {
    surface: colorFromMatugenJson(data, "surface", fallback.surface),
    surfaceDim: colorFromMatugenJson(data, "surface_dim", fallback.surfaceDim),
    surfaceBright: colorFromMatugenJson(data, "surface_bright", fallback.surfaceBright),
    onSurface: colorFromMatugenJson(data, "on_surface", fallback.onSurface),
    onSurfaceVariant: colorFromMatugenJson(
      data,
      "on_surface_variant",
      fallback.onSurfaceVariant,
    ),
    primary: colorFromMatugenJson(data, "primary", fallback.primary),
    onPrimary: colorFromMatugenJson(data, "on_primary", fallback.onPrimary),
    secondary: colorFromMatugenJson(data, "secondary", fallback.secondary),
    onSecondary: colorFromMatugenJson(data, "on_secondary", fallback.onSecondary),
    outline: colorFromMatugenJson(data, "outline", fallback.outline),
    error: colorFromMatugenJson(data, "error", fallback.error),
  }
}

function scheduleThemePreview() {
  themePreviewRequest++
  cancelThemePreviewProcess()

  if (themePreviewSource) {
    GLib.Source.remove(themePreviewSource)
  }

  const request = themePreviewRequest
  themePreviewSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 220, () => {
    themePreviewSource = 0
    updateThemePreview(request)
    return GLib.SOURCE_REMOVE
  })
}

function cancelThemePreviewProcess() {
  themePreviewCancellable?.cancel()

  try {
    if (themePreviewProcess && !themePreviewProcess.get_if_exited()) {
      themePreviewProcess.force_exit()
    }
  } catch {
    // The process may have exited between checking and stopping it.
  }

  themePreviewProcess = null
  themePreviewCancellable = null
}

function cancelThemePreview() {
  themePreviewRequest++
  cancelThemePreviewProcess()

  if (themePreviewSource) {
    GLib.Source.remove(themePreviewSource)
    themePreviewSource = 0
  }
}

function updateThemePreview(request: number) {
  if (request !== themePreviewRequest) {
    return
  }

  const entry = selectedBackground()

  if (!entry) {
    setThemePreview(fallbackThemePreview())
    return
  }

  const previewKey = themeCacheKey(entry.path, selectedPrefer())
  const cached = themePreviewCache[previewKey]

  if (cached) {
    setThemePreview(cached.colors)
    return
  }

  const previewPath = thumbnailPaths()[entry.path] ?? entry.path
  const mode = pickMatugenMode(previewPath)
  const command = [
    "matugen",
    "image",
    previewPath,
    "-m",
    mode,
    "--prefer",
    selectedPrefer(),
    "--dry-run",
    "-j",
    "hex",
    "--quiet",
  ]

  try {
    const process = Gio.Subprocess.new(
      command,
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    )
    const cancellable = new Gio.Cancellable()
    themePreviewProcess = process
    themePreviewCancellable = cancellable

    process.communicate_utf8_async(null, cancellable, (_process, result) => {
      try {
        const [, stdout, stderr] = process.communicate_utf8_finish(result)

        if (request !== themePreviewRequest) {
          return
        }

        if (!process.get_successful()) {
          console.error(
            `matugen preview failed (${process.get_exit_status()}): ${stderr || stdout || command.join(" ")}`,
          )
          return
        }

        const colors = previewFromMatugenJson(JSON.parse(stdout))
        themePreviewCache[previewKey] = { mode, colors }
        saveThemePreviewCache()
        setThemePreview(colors)
      } catch (error) {
        if (request === themePreviewRequest) {
          console.error(`Failed to generate matugen preview: ${command.join(" ")}`, error)
        }
      } finally {
        if (request === themePreviewRequest) {
          themePreviewProcess = null
          themePreviewCancellable = null
        }
      }
    })
  } catch (error) {
    console.error(`Failed to spawn matugen preview: ${command.join(" ")}`, error)
  }
}

function relativeLuminance(red: number, green: number, blue: number) {
  function toLinear(value: number) {
    const normalized = value / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }

  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
}

function pickMatugenMode(path: string): MatugenMode {
  try {
    const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, 64, 64, true)
    const pixels = pixbuf.get_pixels()
    const width = pixbuf.get_width()
    const height = pixbuf.get_height()
    const rowstride = pixbuf.get_rowstride()
    const channels = pixbuf.get_n_channels()
    let luminance = 0
    let samples = 0

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = y * rowstride + x * channels

        if (channels >= 4 && pixels[offset + 3] < 16) {
          continue
        }

        luminance += relativeLuminance(
          pixels[offset],
          pixels[offset + 1],
          pixels[offset + 2],
        )
        samples++
      }
    }

    return samples > 0 && luminance / samples >= 0.5 ? "light" : "dark"
  } catch (error) {
    console.error("Failed to detect wallpaper brightness for matugen", error)
    return "dark"
  }
}

function moveSelection(delta: number) {
  const count = backgrounds().length

  if (count === 0) {
    setSelectedIndex(-1)
    return
  }

  setSelectedIndex((index) => {
    const next = Math.max(0, Math.min(count - 1, index + delta))
    scrollSelectionIntoView(next)
    return next
  })
  scheduleThemePreview()
}

function movePreference(delta: number) {
  const currentIndex = preferOptions.findIndex((option) => option.id === selectedPrefer())
  const nextIndex = Math.max(
    0,
    Math.min(preferOptions.length - 1, currentIndex + delta),
  )

  setSelectedPrefer(preferOptions[nextIndex]?.id ?? "saturation")
  scheduleThemePreview()
}

function isFirstPreferenceSelected() {
  return preferOptions[0]?.id === selectedPrefer()
}

function scrollSelectionIntoView(index: number) {
  if (!wallpaperScroller || index < 0) {
    return
  }

  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    const adjustment = wallpaperScroller?.get_hadjustment()

    if (!adjustment) {
      return GLib.SOURCE_REMOVE
    }

    const itemWidth = 230
    const padding = 16
    const left = index * itemWidth
    const right = left + itemWidth
    const viewportLeft = adjustment.get_value()
    const viewportRight = viewportLeft + adjustment.get_page_size()
    let next = viewportLeft

    if (left < viewportLeft + padding) {
      next = left - padding
    } else if (right > viewportRight - padding) {
      next = right - adjustment.get_page_size() + padding
    }

    const max = adjustment.get_upper() - adjustment.get_page_size()
    adjustment.set_value(Math.max(adjustment.get_lower(), Math.min(max, next)))

    return GLib.SOURCE_REMOVE
  })
}

function scrollHorizontal(scrolledWindow: Gtk.ScrolledWindow, dx: number, dy: number) {
  const adjustment = scrolledWindow.get_hadjustment()

  if (!adjustment) {
    return false
  }

  const delta = dx || dy

  if (delta === 0) {
    return false
  }

  const amount = Math.abs(delta) < 10 ? delta * 90 : delta
  const max = adjustment.get_upper() - adjustment.get_page_size()
  const next = Math.max(adjustment.get_lower(), Math.min(max, adjustment.get_value() + amount))

  adjustment.set_value(next)
  return true
}

function handleKey(keyval: number) {
  switch (keyval) {
    case Gdk.KEY_Left:
      if (activeControl() !== "prefer") {
        moveSelection(-1)
      }
      return true
    case Gdk.KEY_Right:
      if (activeControl() !== "prefer") {
        moveSelection(1)
      }
      return true
    case Gdk.KEY_Up:
      if (activeControl() === "prefer") {
        if (isFirstPreferenceSelected()) {
          setActiveControl("wallpapers")
        } else {
          movePreference(-1)
        }
      } else {
        setActiveControl("wallpapers")
      }
      return true
    case Gdk.KEY_Down:
      if (activeControl() === "prefer") {
        movePreference(1)
      } else if (selectedBackground()) {
        setActiveControl("prefer")
      }
      return true
    case Gdk.KEY_Return:
    case Gdk.KEY_KP_Enter:
      applyBackground(selectedBackground())
      return true
    case Gdk.KEY_Escape:
      closePicker()
      return true
    default:
      return false
  }
}

function BackgroundCard({
  entry,
  index,
}: {
  entry: BackgroundEntry
  index: number
}) {
  const cardClass = createComputed(() => {
    if (selectedIndex() !== index) {
      return "wallpaperCard"
    }

    return activeControl() === "prefer"
      ? "wallpaperCard wallpaperCardSelectedDim"
      : "wallpaperCard wallpaperCardSelected"
  })
  const isCurrent = currentBackgroundPath((path) => path === entry.path)

  return (
    <button
      class={cardClass}
      onClicked={() => {
        setActiveControl("wallpapers")
        setSelectedIndex(index)
        scrollSelectionIntoView(index)
        scheduleThemePreview()
      }}
      $={(button) => button.set_cursor_from_name("pointer")}
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={6}
      >
        <Gtk.Picture
          class="wallpaperPreview"
          file={thumbnailPaths((paths) =>
            Gio.File.new_for_path(paths[entry.path] ?? pendingThumbnailPath),
          )}
          contentFit={Gtk.ContentFit.COVER}
          canShrink
        />

        <label
          class={isCurrent((current) =>
            current ? "wallpaperName wallpaperNameCurrent" : "wallpaperName",
          )}
          label={entry.name}
          ellipsize={Pango.EllipsizeMode.END}
          maxWidthChars={24}
          halign={Gtk.Align.CENTER}
          xalign={0.5}
        />
      </box>
    </button>
  )
}

function PreferButton({ option }: { option: { id: MatugenPrefer; label: string } }) {
  const buttonClass = createComputed(() => {
    if (activeControl() === "prefer" && selectedPrefer() === option.id) {
      return "wallpaperPreferButton wallpaperPreferButtonSelected wallpaperPreferButtonFocused"
    }

    return "wallpaperPreferButton"
  })

  return (
    <button
      class={buttonClass}
      hexpand
      halign={Gtk.Align.FILL}
      onClicked={() => {
        setActiveControl("prefer")
        setSelectedPrefer(option.id)
        scheduleThemePreview()
      }}
      $={(button) => button.set_cursor_from_name("pointer")}
    >
      <box>
        <label label={option.label} />
      </box>
    </button>
  )
}

function SelectedBackgroundPanel() {
  const name = selectedBackground((entry) => entry?.name ?? "")

  return (
    <box
      class="wallpaperSelectionPanel"
      spacing={12}
      visible={selectedBackground((entry) => Boolean(entry))}
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={8}
        hexpand
      >
        <label
          class="wallpaperSelectionName"
          label={name}
          ellipsize={Pango.EllipsizeMode.END}
          halign={Gtk.Align.START}
          xalign={0}
        />

        <box
          class="wallpaperPreferOptions"
          orientation={Gtk.Orientation.VERTICAL}
          spacing={6}
        >
          <For each={matugenPreferOptions}>
            {(option) => <PreferButton option={option as { id: MatugenPrefer; label: string }} />}
          </For>
        </box>
      </box>
    </box>
  )
}

function ThemePreviewCard({
  title,
  children,
}: {
  title: string
  children: JSX.Element
}) {
  return (
    <box
      class="wallpaperThemePreviewCard"
      orientation={Gtk.Orientation.VERTICAL}
      spacing={8}
      hexpand
    >
      <label
        class="wallpaperThemePreviewTitle"
        label={title}
        halign={Gtk.Align.START}
      />

      {children}
    </box>
  )
}

function MenuThemePreview() {
  const shellCss = createComputed(() => {
    const colors = themePreview()
    return `background: ${colors.surfaceDim}; color: ${colors.onSurface};`
  })
  const selectedCss = createComputed(() => {
    const colors = themePreview()
    return `background: ${colors.primary}; color: ${colors.onPrimary};`
  })
  const mutedCss = createComputed(() => `color: ${themePreview().onSurfaceVariant};`)

  return (
    <ThemePreviewCard title="Menu">
      <box
        class="wallpaperMenuPreview"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={6}
        css={shellCss}
      >
        <box spacing={8}>
          <box class="wallpaperPreviewDot" css={createComputed(() => `background: ${themePreview().primary};`)} />
          <label label="Launcher" halign={Gtk.Align.START} />
        </box>
        <box class="wallpaperPreviewRowSelected" css={selectedCss}>
          <label label="Firefox" halign={Gtk.Align.START} />
        </box>
        <box class="wallpaperPreviewRow">
          <label label="Terminal" halign={Gtk.Align.START} />
          <label label="dev" halign={Gtk.Align.END} hexpand css={mutedCss} />
        </box>
      </box>
    </ThemePreviewCard>
  )
}

function TerminalThemePreview() {
  const terminalCss = createComputed(() => {
    const colors = themePreview()
    return `background: ${colors.surface}; color: ${colors.onSurface}; border: 1px solid ${colors.surfaceBright};`
  })
  const promptCss = createComputed(() => `color: ${themePreview().primary};`)
  const accentCss = createComputed(() => `color: ${themePreview().secondary};`)
  const errorCss = createComputed(() => `color: ${themePreview().error};`)

  return (
    <ThemePreviewCard title="Cmd">
      <box
        class="wallpaperTerminalPreview"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={4}
        css={terminalCss}
      >
        <label label="$user@host" halign={Gtk.Align.START} css={promptCss} />
        <label label="~/Personal Projects/ThemeDotFiles % ls" halign={Gtk.Align.START} />
        <label label="dot-config-files  README.md" halign={Gtk.Align.START} css={accentCss} />
        <label label="status: themed preview" halign={Gtk.Align.START} css={errorCss} />
      </box>
    </ThemePreviewCard>
  )
}

function YaziThemePreview() {
  const paneCss = createComputed(() => {
    const colors = themePreview()
    return `background: ${colors.surface}; color: ${colors.onSurface}; border: 1px solid ${colors.outline};`
  })
  const tabCss = createComputed(() => {
    const colors = themePreview()
    return `background: ${colors.primary}; color: ${colors.onPrimary};`
  })
  const selectedCss = createComputed(() => {
    const colors = themePreview()
    return `background: ${colors.secondary}; color: ${colors.onSecondary};`
  })
  const mutedCss = createComputed(() => `color: ${themePreview().onSurfaceVariant};`)

  return (
    <ThemePreviewCard title="Yazi">
      <box
        class="wallpaperYaziPreview"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={5}
        css={paneCss}
      >
        <box class="wallpaperYaziTab" css={tabCss}>
          <label label="ThemeDotFiles" halign={Gtk.Align.START} />
        </box>
        <box spacing={6}>
          <label label="ags/" halign={Gtk.Align.START} css={mutedCss} />
          <label label="matugen/" halign={Gtk.Align.START} />
        </box>
        <box class="wallpaperPreviewRowSelected" css={selectedCss}>
          <label label="WallpaperPicker.tsx" halign={Gtk.Align.START} />
        </box>
        <label label="theme.toml  hyprland.conf" halign={Gtk.Align.START} css={mutedCss} />
      </box>
    </ThemePreviewCard>
  )
}

function ThemePreviewPanel() {
  return (
    <box
      class="wallpaperThemePreviewPanel"
      spacing={10}
      visible={selectedBackground((entry) => Boolean(entry))}
      hexpand
    >
      <MenuThemePreview />
      <TerminalThemePreview />
      <YaziThemePreview />
    </box>
  )
}

function PickerPanel() {
  return (
    <box
      class="wallpaperPickerPanel"
      orientation={Gtk.Orientation.VERTICAL}
      spacing={10}
      hexpand
    >
      <scrolledwindow
        class="wallpaperPickerScroller"
        hscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
        vscrollbarPolicy={Gtk.PolicyType.NEVER}
        hexpand
        $={(scrolledWindow) => {
          wallpaperScroller = scrolledWindow

          const scroll = Gtk.EventControllerScroll.new(Gtk.EventControllerScrollFlags.BOTH_AXES)
          scroll.connect("scroll", (_controller, dx, dy) => scrollHorizontal(scrolledWindow, dx, dy))
          scrolledWindow.add_controller(scroll)
        }}
      >
        <box
          class="wallpaperPickerRow"
          orientation={Gtk.Orientation.HORIZONTAL}
          spacing={12}
        >
          <For each={indexedBackgrounds}>
            {(entry) => (
              <BackgroundCard
                entry={entry}
                index={entry.index}
              />
            )}
          </For>
        </box>
      </scrolledwindow>

      <label
        class="wallpaperPickerEmpty"
        label="No backgrounds found"
        visible={backgrounds((items) => items.length === 0)}
      />

      <box
        class="wallpaperPickerDetails"
        spacing={10}
        visible={selectedBackground((entry) => Boolean(entry))}
      >
        <SelectedBackgroundPanel />
        <ThemePreviewPanel />
      </box>
    </box>
  )
}

export default function WallpaperPicker(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor
  const geometry = gdkmonitor.get_geometry()

  // Fill the persistent cache in the background before the picker opens.
  queueBackgroundThumbnails(listBackgrounds())

  return (
    <window
      name="wallpaperpicker"
      class="WallpaperPicker"
      visible={false}
      decorated={false}
      resizable={false}
      canFocus
      $={(window) => {
        window.namespace = "ags-wallpaperpicker"
        window.gdkmonitor = gdkmonitor
        window.set_default_size(geometry.width, geometry.height)
        window.exclusivity = Astal.Exclusivity.IGNORE
        window.keymode = Astal.Keymode.EXCLUSIVE
        window.anchor = TOP | LEFT | RIGHT | BOTTOM
        window.layer = Astal.Layer.OVERLAY
        window.application = app

        const keyController = Gtk.EventControllerKey.new()
        keyController.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        keyController.connect("key-pressed", (_controller, keyval) => handleKey(keyval))
        window.add_controller(keyController)

        window.connect("notify::visible", () => {
          if (window.visible) {
            refreshBackgrounds()
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
              window.grab_focus()
              return GLib.SOURCE_REMOVE
            })
          } else {
            cancelThemePreview()
          }
        })
      }}
    >
      <centerbox
        class="wallpaperPickerOverlay"
        orientation={Gtk.Orientation.VERTICAL}
        widthRequest={geometry.width}
        heightRequest={geometry.height}
        hexpand
        vexpand
        halign={Gtk.Align.FILL}
        valign={Gtk.Align.FILL}
        $={(overlay) => {
          const click = Gtk.GestureClick.new()
          click.set_button(0)
          click.connect("pressed", (_gesture, _presses, x, y) => {
            const target = overlay.pick(x, y, Gtk.PickFlags.DEFAULT)

            if (!isInsideCssClass(target, "wallpaperPickerPanel")) {
              closePicker()
            }
          })
          overlay.add_controller(click)
        }}
      >
        <box
          $type="center"
          marginStart={50}
          marginEnd={50}
          hexpand
          halign={Gtk.Align.FILL}
        >
          <PickerPanel />
        </box>
      </centerbox>
    </window>
  )
}
