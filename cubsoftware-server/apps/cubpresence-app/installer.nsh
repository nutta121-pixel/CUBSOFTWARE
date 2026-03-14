!macro customInit
  ; Kill CubPresence if running
  nsExec::ExecToLog 'taskkill /F /IM "CubPresence.exe"'
  Sleep 1000
!macroend

!macro customInstall
  ; Kill again just to be safe
  nsExec::ExecToLog 'taskkill /F /IM "CubPresence.exe"'
!macroend
