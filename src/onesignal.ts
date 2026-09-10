type OneSignalClient = {
  init: (options: Record<string, unknown>) => Promise<void>
  login: (externalId: string) => Promise<void>
  logout: () => Promise<void>
  User: { addTag: (key: string, value: string) => Promise<void> }
  Notifications: { permission: boolean; requestPermission: () => Promise<boolean> }
}

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalClient) => void | Promise<void>>
  }
}

const appId = import.meta.env.VITE_ONESIGNAL_APP_ID
let initialized = false

export function initializePush(onPermission?: (allowed: boolean) => void) {
  if (!appId || initialized) return
  initialized = true
  window.OneSignalDeferred = window.OneSignalDeferred || []
  window.OneSignalDeferred.push(async oneSignal => {
    await oneSignal.init({
      appId,
      safari_web_id: 'web.onesignal.auto.48c84a0b-cc60-468f-93c1-13b193c27b88',
      notifyButton: { enable: false },
      serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
      serviceWorkerParam: { scope: '/push/onesignal/' },
    })
    onPermission?.(oneSignal.Notifications.permission)
  })
}

export function identifyPushUser(profileId: string) {
  if (!appId || !profileId) return
  window.OneSignalDeferred = window.OneSignalDeferred || []
  window.OneSignalDeferred.push(async oneSignal => {
    await oneSignal.login(profileId)
    await oneSignal.User.addTag('profile_id', profileId)
  })
}

export function requestPushPermission(onResult: (allowed: boolean) => void) {
  if (!appId) return onResult(false)
  window.OneSignalDeferred = window.OneSignalDeferred || []
  window.OneSignalDeferred.push(async oneSignal => {
    const allowed = await oneSignal.Notifications.requestPermission()
    onResult(allowed)
  })
}

export function forgetPushUser() {
  window.OneSignalDeferred = window.OneSignalDeferred || []
  window.OneSignalDeferred.push(oneSignal => oneSignal.logout())
}
