import { useEffect, type Dispatch, type SetStateAction } from 'react'

type UseFooterLayoutSyncOptions = {
  episodeGuid: string | null | undefined
  isMobile: boolean
  isFooterExpanded: boolean
  cancelFooterExpandTimer: () => void
  setIsFooterExpanding: Dispatch<SetStateAction<boolean>>
  setIsFooterExpanded: Dispatch<SetStateAction<boolean>>
  setIsSidebarCompact: Dispatch<SetStateAction<boolean>>
}

export function useFooterLayoutSync({
  episodeGuid,
  isMobile,
  isFooterExpanded,
  cancelFooterExpandTimer,
  setIsFooterExpanding,
  setIsFooterExpanded,
  setIsSidebarCompact,
}: UseFooterLayoutSyncOptions): void {
  useEffect(() => {
    if (!episodeGuid) {
      cancelFooterExpandTimer()
      setIsFooterExpanding(false)
      setIsFooterExpanded(false)
      setIsSidebarCompact(false)
      return
    }

    if (isMobile) {
      cancelFooterExpandTimer()
      setIsFooterExpanding(false)
      setIsSidebarCompact(false)
      return
    }

    if (isFooterExpanded) {
      setIsSidebarCompact(true)
    }
  }, [cancelFooterExpandTimer, episodeGuid, isFooterExpanded, isMobile, setIsFooterExpanded, setIsFooterExpanding, setIsSidebarCompact])
}
