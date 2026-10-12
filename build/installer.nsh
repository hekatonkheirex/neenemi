!include "LogicLib.nsh"
!include "StdUtils.nsh"

!macro customInstall
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 != 1
    ; Validate the downloaded redistributable on Windows before asking for elevation.
    System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("NEENEMI_VC_REDIST", "$INSTDIR\resources\vc_redist.x64.exe").r0'
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "$$s = Get-AuthenticodeSignature -LiteralPath $$env:NEENEMI_VC_REDIST; if ($$s.Status -ne 'Valid' -or $$s.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { exit 1 }; exit 0"`
    Pop $0
    Pop $1
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "La firma del redistribuible Visual C++ no es válida. La instalación se canceló."
      Abort
    ${EndIf}
    ${StdUtils.ExecShellWaitEx} $0 $1 "$INSTDIR\resources\vc_redist.x64.exe" "runas" "/install /quiet /norestart"
    ${If} $0 != "ok"
      MessageBox MB_ICONSTOP "No se pudo iniciar Visual C++ Runtime. Autoriza su instalación y vuelve a intentar."
      Abort
    ${EndIf}
    ${StdUtils.WaitForProcEx} $2 $1
    ${If} $2 == 3010
      SetRebootFlag true
    ${ElseIf} $2 != 0
    ${AndIf} $2 != 1638
      MessageBox MB_ICONSTOP "Visual C++ Runtime no se instaló. Código: $2."
      Abort
    ${EndIf}
  ${EndIf}
!macroend
