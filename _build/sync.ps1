# sync.ps1 - publish ReadFast (reading-trainer) to BOTH targets in one go.
#   1) app repo (reading-trainer): commit + push -> GitHub Pages
#   2) homepage mirror: copy app into site/static/reading-trainer (served at seunghoonchoi.com/reading-trainer)
#   3) site repo: commit + push ONLY reading-trainer paths (other in-progress work is left untouched)
#
# Usage:  powershell -ExecutionPolicy Bypass -File "_build\sync.ps1" [-Message "summary"] [-SitePath "X:\path\to\site-repo"]
# (ASCII-only on purpose so Windows PowerShell parses it regardless of file encoding.
#  The site repo lives under a non-ASCII path, so it is resolved from _build\site-path.local.txt
#  - a UTF-8 one-line file, gitignored - or passed via -SitePath.)
#
# NOTE: the mirror is overwritten with /MIR. NEVER hand-edit files under site/static/reading-trainer -
#       edit the app repo instead (analytics snippet etc. live in the app's index.html).
param([string]$Message = "", [string]$SitePath = "")

$App = Split-Path -Parent $PSScriptRoot                 # ...\<app folder>
$ident = @('-c', 'user.name=Seunghoon Choi', '-c', 'user.email=herring2141@gmail.com')
if (-not $Message) { $Message = "Update ReadFast ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))" }

function Step($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Die($m)  { Write-Host $m -ForegroundColor Red; exit 1 }

# resolve site repo path: -SitePath > site-path.local.txt > legacy drive-root guess
$Site = $SitePath
if (-not $Site) {
  $cfg = Join-Path $PSScriptRoot 'site-path.local.txt'
  if (Test-Path $cfg) { $Site = (Get-Content $cfg -Encoding UTF8 | Select-Object -First 1).Trim() }
}
if (-not $Site) {
  $DriveRoot = Split-Path -Qualifier $App
  $Site = Join-Path "$DriveRoot\" 'seunghoonchoi-site'
}
if (-not (Test-Path $Site)) { Die "Site repo not found: $Site  (write the absolute path into _build\site-path.local.txt as UTF-8, or pass -SitePath)" }
$Mirror = Join-Path $Site 'static\reading-trainer'

# 1) app repo - stage a whitelist (never add -A: keeps local scratch out of the public repo)
Step "1/3  app repo commit + push (reading-trainer)"
git -C $App add -- index.html css js data icons og.png sw.js manifest.webmanifest icon.svg README.md .nojekyll .gitignore _build/sync.ps1 _build/serve.py
if (git -C $App status --porcelain -- index.html css js data icons og.png sw.js manifest.webmanifest icon.svg README.md .nojekyll .gitignore _build/sync.ps1 _build/serve.py) {
  git -C $App @ident commit -m $Message
  if ($LASTEXITCODE -ne 0) { Die "app commit failed (NDA hook?) - aborting" }
  git -C $App push
  if ($LASTEXITCODE -ne 0) { Die "app push failed - aborting" }
  Write-Host "app repo pushed." -ForegroundColor Green
} else { Write-Host "no changes - skip" }

# 2) homepage mirror (domain-served copy). /MIR mirrors (reflects deletions); exclude _build and .git
Step "2/3  homepage mirror (static/reading-trainer)"
robocopy $App $Mirror /MIR /XD "$App\_build" "$App\.git" "$App\.claude" /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Die "robocopy failed (exit $LASTEXITCODE)" }
Write-Host "mirror synced (robocopy exit $LASTEXITCODE)."

# 3) site repo - stage ONLY reading-trainer paths (protect other uncommitted work)
Step "3/3  site repo: commit + push reading-trainer only"
$cards = Get-ChildItem -Path (Join-Path $Site 'content') -Recurse -Filter 'reading-trainer.md' | ForEach-Object { $_.FullName.Substring($Site.Length + 1) }
git -C $Site add -- 'static/reading-trainer' 'static/images/reading-trainer-card.svg' @cards
if (git -C $Site diff --cached --name-only) {
  git -C $Site @ident commit -m "ReadFast mirror update - $Message"
  if ($LASTEXITCODE -ne 0) { Die "site commit failed - aborting" }
  git -C $Site push
  if ($LASTEXITCODE -ne 0) { Die "site push failed - aborting" }
  Write-Host "site repo pushed." -ForegroundColor Green
} else { Write-Host "no reading-trainer change on site - skip" }

Write-Host "`n[OK] sync complete" -ForegroundColor Green
Write-Host "  live  : https://seunghoonchoi.com/reading-trainer/"
Write-Host "  pages : https://seunghoonchoi-phd.github.io/reading-trainer/"
Write-Host "  repo  : https://github.com/seunghoonchoi-phd/reading-trainer"
Write-Host "  (homepage Actions build lands in ~1-2 min)"
