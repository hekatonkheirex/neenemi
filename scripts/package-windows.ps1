param([string]$Configuration = 'Release', [string]$InnoCompiler = '')
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'El empaquetado WinUI requiere Windows x64.' }
$Root = Split-Path -Parent $PSScriptRoot
$Output = Join-Path $Root 'release\windows-x64'
$Resources = Join-Path $Output 'resources'
$Dependencies = Join-Path $Root 'build\installer-dependencies'
New-Item -ItemType Directory -Force -Path $Output, $Dependencies | Out-Null
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw 'Instala el SDK .NET 10 y las herramientas de desarrollo Windows.' }
if (-not $InnoCompiler) {
    $Found = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($Found) { $InnoCompiler = $Found.Source }
    else { $InnoCompiler = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe' }
}
if (-not (Test-Path $InnoCompiler)) { throw 'Instala Inno Setup 6 o indica -InnoCompiler <ruta a ISCC.exe>.' }
& dotnet test (Join-Path $Root 'native\Neenemi.Core.Tests\Neenemi.Core.Tests.csproj') -c $Configuration
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas del núcleo.' }
& dotnet publish (Join-Path $Root 'native\Neenemi.App\Neenemi.App.csproj') -c $Configuration -p:Platform=x64 -r win-x64 --self-contained true -o $Output
if ($LASTEXITCODE -ne 0) { throw 'Falló la publicación WinUI.' }
& dotnet run --project (Join-Path $Root 'native\Neenemi.Tools\Neenemi.Tools.csproj') -c $Configuration -- --output $Resources
if ($LASTEXITCODE -ne 0) { throw 'Falló la preparación de recursos verificados.' }
$VCRuntime = Join-Path $Dependencies 'vc_redist.x64.exe'
Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $VCRuntime
$Signature = Get-AuthenticodeSignature -FilePath $VCRuntime
if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'La firma del redistribuible Visual C++ no es válida.' }
Copy-Item (Join-Path $Root 'docs\THIRD-PARTY.md') (Join-Path $Output 'THIRD-PARTY.md') -Force
& $InnoCompiler "/DAppDirectory=$Output" "/DDependencyDirectory=$Dependencies" "/DReleaseDirectory=$(Join-Path $Root 'release')" (Join-Path $Root 'installer\neenemi.iss')
if ($LASTEXITCODE -ne 0) { throw 'Falló la generación del instalador.' }
Write-Host 'Instalador generado en release\Neenemi-0.1.0-Setup.exe. No se publicó automáticamente.'
