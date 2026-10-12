#ifndef AppDirectory
  #define AppDirectory "..\release\windows-x64"
#endif
#ifndef DependencyDirectory
  #define DependencyDirectory "..\build\installer-dependencies"
#endif
#ifndef ReleaseDirectory
  #define ReleaseDirectory "..\release"
#endif

[Setup]
AppId={{9E060F8C-201D-4C45-9788-9084D94304CE}
AppName=Ñe'eñemi
AppVersion=0.1.0
AppPublisher=Data Systems S.A.E.C.A.
DefaultDirName={localappdata}\Programs\NeenemiNative
DefaultGroupName=Ñe'eñemi
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#ReleaseDirectory}
OutputBaseFilename=Neenemi-0.1.0-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\neenemi.exe
CloseApplications=yes

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "{#AppDirectory}\*"; DestDir: "{app}"; Excludes: "resources\.downloads\*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#DependencyDirectory}\vc_redist.x64.exe"; Flags: dontcopy

[Icons]
Name: "{group}\Ñe'eñemi"; Filename: "{app}\neenemi.exe"
Name: "{autodesktop}\Ñe'eñemi"; Filename: "{app}\neenemi.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; Flags: unchecked

[Run]
Filename: "{app}\neenemi.exe"; Description: "Abrir Ñe'eñemi"; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Installed: Cardinal;
  ResultCode: Integer;
begin
  Result := '';
  if RegQueryDWordValue(HKLM64, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Installed', Installed) and (Installed = 1) then
    Exit;
  ExtractTemporaryFile('vc_redist.x64.exe');
  if not ShellExec('runas', ExpandConstant('{tmp}\vc_redist.x64.exe'), '/install /quiet /norestart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Result := 'No se pudo instalar Visual C++ Runtime. Autoriza la instalación y vuelve a intentar.'
  else if ResultCode = 3010 then
    NeedsRestart := True
  else if (ResultCode <> 0) and (ResultCode <> 1638) then
    Result := 'Visual C++ Runtime no se instaló. Código: ' + IntToStr(ResultCode);
end;
