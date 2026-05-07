<#
.SYNOPSIS
    Convert images (PNG/JPG/TIFF/BMP) to WebP using cwebp.

.PARAMETER Path
    File or directory to convert.

.PARAMETER Quality
    Lossy WebP quality 0-100. Default 80.

.PARAMETER Recurse
    When Path is a directory, walk subdirectories.

.PARAMETER OutputDir
    Write .webp files into this directory instead of next to the source.
    With -Recurse, relative subdirectory structure is preserved.

.PARAMETER Force
    Overwrite existing .webp output files.

.EXAMPLE
    .\Convert-ImagesToWebP.ps1 -Path .\image.png

.EXAMPLE
    .\Convert-ImagesToWebP.ps1 -Path .\assets -Recurse -Quality 90 -OutputDir .\out
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [string]$Path,

    [ValidateRange(0, 100)]
    [int]$Quality = 80,

    [switch]$Recurse,

    [string]$OutputDir,

    [switch]$Force
)

if (-not (Get-Command cwebp -ErrorAction SilentlyContinue)) {
    Write-Host "cwebp.exe not found on PATH. Install one of:" -ForegroundColor Red
    Write-Host "  winget install Google.LibWebP"
    Write-Host "  scoop install libwebp"
    Write-Host "  https://developers.google.com/speed/webp/download"
    exit 1
}

if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "Path not found: $Path" -ForegroundColor Red
    exit 1
}

$resolved = Get-Item -LiteralPath $Path
$supportedExt = '\.(png|jpe?g|tiff?|bmp)$'

if ($resolved.PSIsContainer) {
    $files = Get-ChildItem -LiteralPath $resolved.FullName -File -Recurse:$Recurse |
        Where-Object { $_.Extension -match $supportedExt }
    $rootDir = $resolved.FullName
} else {
    if ($resolved.Extension -notmatch $supportedExt) {
        Write-Host "Unsupported input extension: $($resolved.Extension)" -ForegroundColor Red
        exit 1
    }
    $files = @($resolved)
    $rootDir = $resolved.Directory.FullName
}

if (-not $files -or $files.Count -eq 0) {
    Write-Host "No supported images found under: $($resolved.FullName)"
    exit 0
}

$outRoot = $null
if ($OutputDir) {
    $null = New-Item -ItemType Directory -Path $OutputDir -Force
    $outRoot = (Resolve-Path -LiteralPath $OutputDir).Path
}

$converted = 0
$skipped = 0
$failed = 0

foreach ($file in $files) {
    if ($outRoot) {
        $relativeDir = $file.Directory.FullName.Substring($rootDir.Length).TrimStart('\', '/')
        $destDir = if ($relativeDir) { Join-Path $outRoot $relativeDir } else { $outRoot }
        $null = New-Item -ItemType Directory -Path $destDir -Force
    } else {
        $destDir = $file.Directory.FullName
    }

    $destPath = Join-Path $destDir ($file.BaseName + '.webp')

    if ((Test-Path -LiteralPath $destPath) -and -not $Force) {
        Write-Host "skip   $($file.FullName) -> $destPath (exists; use -Force)"
        $skipped++
        continue
    }

    Write-Host "encode $($file.FullName) -> $destPath"
    & cwebp -q $Quality $file.FullName -o $destPath
    if ($LASTEXITCODE -eq 0) {
        $converted++
    } else {
        Write-Warning "cwebp failed on $($file.FullName) (exit $LASTEXITCODE)"
        $failed++
    }
}

Write-Host ""
Write-Host "Converted $converted, skipped $skipped, failed $failed"

if ($failed -gt 0) { exit 2 }
