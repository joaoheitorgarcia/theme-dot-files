declare const SRC: string

declare module "inline:*" {
  const content: string
  export default content
}

declare module "*.scss" {
  const content: string
  export default content
}

declare module "*.blp" {
  const content: string
  export default content
}

declare module "*.css" {
  const content: string
  export default content
}

declare module "gi://AstalApps" {
  const AstalApps: any
  export default AstalApps
}

declare module "gi://AstalBattery" {
  const AstalBattery: any
  export default AstalBattery
}

declare module "gi://AstalBluetooth" {
  const AstalBluetooth: any
  export default AstalBluetooth
}

declare module "gi://AstalHyprland" {
  const AstalHyprland: any
  export default AstalHyprland
}

declare module "gi://AstalMpris" {
  const AstalMpris: any
  export default AstalMpris
}

declare module "gi://AstalNetwork" {
  const AstalNetwork: any
  export default AstalNetwork
}

declare module "gi://AstalNotifd" {
  const AstalNotifd: any
  export default AstalNotifd
}

declare module "gi://AstalPowerProfiles" {
  const AstalPowerProfiles: any
  export default AstalPowerProfiles
}

declare module "gi://AstalTray" {
  const AstalTray: any
  export default AstalTray
}

declare module "gi://AstalWp" {
  const AstalWp: any
  export default AstalWp
}
