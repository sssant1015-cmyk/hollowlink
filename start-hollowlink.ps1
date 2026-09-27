# HollowLink one-click launcher for Windows
#
#   Double-click  start-hollowlink.cmd   ->  starts everything and prints the share link
#   Double-click  stop-hollowlink.cmd    ->  stops everything
#
# Or from a terminal:
#   .\start-hollowlink.ps1            normal start
#   .\start-hollowlink.ps1 -Stop      stop all HollowLink processes
#
# What it does:
#   1. Starts the API (port 8787) and web app (port 5173) if not already running
#   2. Starts a free public Cloudflare quick-tunnel if none is running
#   3. Prints the share link, copies it to your clipboard, opens your browser
#
# Requires: cloudflared on PATH (winget install Cloudflare.cloudflared)
param(
  [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$Root      = $PSScriptRoot
$TunnelLog    = Join-Path $Root '.cloudflared-tunnel.log'
$TunnelErrLog = Join-Path $Root '.cloudflared-tunnel.err.log'
$WebPort   = 5173
$ApiPort   = 8787

# Locate cloudflared: PATH first, then the MSI's default install dir (winget installs
# the machine-wide MSI whose directory is often missing from the current PATH).
$Cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $Cloudflared) {
  foreach ($candidate in @(
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe",
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe')
  )) {
    if (Test-Path $candidate) { $Cloudflared = $candidate; break }
  }
}

function Write-Step($m)  { Write-Host ("==> " + $m) -ForegroundColor Cyan }
function Write-Ok($m)    { Write-Host ("    " + $m) -ForegroundColor Green }
function Write-Warn2($m) { Write-Host ("    " + $m) -ForegroundColor Yellow }

function Test-Http([string]$url) {
  # HTTP probe (IPv4+IPv6 agnostic) — TCP checks miss IPv6-only listeners like Vite on ::1.
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    return ($resp.StatusCode -lt 500)
  } catch {
    if ($_.Exception.Response) { return $true } # server answered, even with 4xx
    return $false
  }
}

function Wait-Http([string]$url, [int]$seconds) {
  for ($i = 0; $i -lt ($seconds * 2); $i++) {
    if (Test-Http $url) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Find-TunnelUrl {
  if (Test-Path $TunnelLog) {
    $match = Select-String -Path $TunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { return $match.Matches[0].Value }
  }
  if (Test-Path $TunnelErrLog) {
    $match = Select-String -Path $TunnelErrLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { return $match.Matches[0].Value }
  }
  return $null
}

function Start-ManagedTunnel {
  Remove-Item $TunnelLog, $TunnelErrLog -ErrorAction SilentlyContinue
  # Start-Process with -RedirectStandardOutput handles spaces in paths reliably
  # (no cmd.exe layer to mangle quoting).
  Start-Process -FilePath $Cloudflared `
    -ArgumentList 'tunnel', '--url', "http://localhost:$WebPort" `
    -WindowStyle Hidden `
    -RedirectStandardOutput $TunnelLog -RedirectStandardError $TunnelErrLog
  for ($i = 0; $i -lt 90; $i++) {
    $u = Find-TunnelUrl
    if ($u) { return $u }
    Start-Sleep -Milliseconds 500
  }
  throw "Tunnel did not report a URL within 45s - check $TunnelLog and $TunnelErrLog"
}

# ── stop mode ────────────────────────────────────────────────────────────────
if ($Stop) {
  Write-Step 'Stopping HollowLink...'
  foreach ($port in @($ApiPort, $WebPort)) {
    try {
      Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
          try {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            Write-Ok ("stopped PID $_ (port $port)")
          } catch {}
        }
    } catch {}
  }
  Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force; Write-Ok 'stopped cloudflared tunnel' } catch {}
  }
  Remove-Item $TunnelLog -ErrorAction SilentlyContinue
  Remove-Item $TunnelErrLog -ErrorAction SilentlyContinue
  Write-Host ''
  Write-Host 'HollowLink is fully stopped.' -ForegroundColor Green
  exit 0
}

# ── start mode ───────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '  HOLLOWLINK launcher' -ForegroundColor Magenta
Write-Host ''

# Check cloudflared exists before doing anything
if (-not $Cloudflared) {
  Write-Warn2 'cloudflared is not installed - friends on the internet will not be able to connect.'
  Write-Warn2 'Install it with:  winget install Cloudflare.cloudflared'
  Write-Warn2 'Continuing with local-only mode...'
  $tunnelAvailable = $false
} else {
  $tunnelAvailable = $true
}

# 1) API
if (Test-Http "http://127.0.0.1:$ApiPort/api/health") {
  Write-Step ("API already running on port $ApiPort")
} else {
  Write-Step 'Starting API (npm run dev:api)...'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/s','/c','npm run dev:api' -WorkingDirectory $Root -WindowStyle Minimized
  if (Wait-Http "http://127.0.0.1:$ApiPort/api/health" 60) { Write-Ok ("API is up on port $ApiPort") }
  else { throw "API did not come up on port $ApiPort within 60s - check the minimized window for errors" }
}

# 2) Web app
if (Test-Http "http://localhost:$WebPort") {
  Write-Step ("Web app already running on port $WebPort")
} else {
  Write-Step 'Starting web app (vite)...'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/s','/c','npx vite --port 5173 --strictPort > ..\vite.log 2>&1' -WorkingDirectory (Join-Path $Root 'frontend') -WindowStyle Minimized
  if (Wait-Http "http://localhost:$WebPort" 60) { Write-Ok ("Web app is up on port $WebPort") }
  else { throw "Web app did not come up on port $WebPort within 60s - check the minimized window for errors" }
}

# 3) Public tunnel
$url = $null
if ($tunnelAvailable) {
  $tunnelRunning = [bool](Get-Process cloudflared -ErrorAction SilentlyContinue)
  if ($tunnelRunning) {
    $url = Find-TunnelUrl
    if ($url) {
      Write-Step 'Tunnel already running:'
      Write-Ok $url
    } else {
      # A cloudflared exists but we can't recover its URL (e.g. started manually).
      # Kill it and start a managed one so the launcher can always report a link.
      Write-Step 'Replacing unmanaged tunnel with a managed one...'
      Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
      $url = Start-ManagedTunnel
    }
  } else {
    Write-Step 'Starting free public tunnel (cloudflared)...'
    $url = Start-ManagedTunnel
  }
}

# 4) Share
Write-Host ''
if ($url) {
  Write-Host '  +--------------------------------------------------+'
  Write-Host '  |  SHARE THIS LINK WITH YOUR FRIENDS:              ' -ForegroundColor Green
  Write-Host ("  |  " + $url) -ForegroundColor White
  Write-Host '  +--------------------------------------------------+'
  try { Set-Clipboard -Value $url; Write-Host '  (link copied to clipboard)' -ForegroundColor DarkGray } catch {}
  try { Start-Process $url } catch {}
}
Write-Host ("  Local:   http://localhost:$WebPort") -ForegroundColor DarkGray
Write-Host '  Keep the minimized server windows open while friends are using the app.' -ForegroundColor DarkGray
Write-Host '  Stop everything:  stop-hollowlink.cmd' -ForegroundColor DarkGray
Write-Host ''
