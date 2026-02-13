import type { ChangeEvent, RefObject } from 'react'

type AppMediaControlsProps = {
  audioRef: RefObject<HTMLAudioElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  audioFileAccept: string
  startLocalFile: (file: File) => Promise<void>
}

export function AppMediaControls({
  audioRef,
  fileInputRef,
  audioFileAccept,
  startLocalFile,
}: AppMediaControlsProps) {
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void startLocalFile(file)
    event.currentTarget.value = ''
  }

  return (
    <>
      <audio ref={audioRef} className="pcAudio" preload="metadata" playsInline />

      <input
        ref={fileInputRef}
        type="file"
        accept={audioFileAccept}
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
    </>
  )
}
