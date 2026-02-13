import { useCallback, useEffect, useMemo, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  platforms: string[]
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

function isStandaloneMode(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function getInstallHelpMessage(): string {
  const ua = window.navigator.userAgent
  const isAndroid = /Android/i.test(ua)
  const isWindows = /Windows/i.test(ua)
  const isIOS = /iPad|iPhone|iPod/i.test(ua)
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua)
  const isFirefox = /Firefox|FxiOS/i.test(ua)

  if (isFirefox && isWindows) {
    return 'Firefox on Windows: click the Web Apps button in the address bar to install this site. If it is missing, update Firefox and use a regular (non-private) window.'
  }
  if (isFirefox && isAndroid) {
    return 'Firefox on Android: open the browser menu, then choose Install or Add to Home screen.'
  }
  if (isIOS && isSafari) {
    return 'Safari on iOS: tap Share, then choose "Add to Home Screen".'
  }
  if (isFirefox) {
    return 'Firefox web-app install is currently available on Windows desktop and Android. On this device, use Chrome or Edge.'
  }
  return 'If no prompt appears, open your browser menu and choose "Install app" or "Add to Home screen".'
}

type UseInstallPromptResult = {
  canInstall: boolean
  installing: boolean
  triggerInstall: () => Promise<void>
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode())

  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)')
    const onModeChange = () => setIsInstalled(isStandaloneMode())
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallPrompt(null)
      setIsInstalled(true)
    }

    onModeChange()
    mode.addEventListener?.('change', onModeChange)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      mode.removeEventListener?.('change', onModeChange)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const triggerInstall = useCallback(async () => {
    if (installing) return
    if (!installPrompt) {
      window.alert(getInstallHelpMessage())
      return
    }

    setInstalling(true)
    try {
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') setInstallPrompt(null)
    } finally {
      setInstalling(false)
    }
  }, [installPrompt, installing])

  const canInstall = useMemo(() => !isInstalled, [isInstalled])

  return {
    canInstall,
    installing,
    triggerInstall,
  }
}
