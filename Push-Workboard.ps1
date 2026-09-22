<#
  Push-Workboard.ps1 - send _Claude\Tools\Workboard to GitHub (gregcabe/workboard).

  Adapted from Push-WCC.ps1 on 22 Sep 2026. Differences: the staging folder is the
  tool's own working folder, root files are listed by name (no root\ subfolder), and
  a first push into an EMPTY repository is handled (no main branch to clone yet).

  Replaces dragging folders onto github.com by hand. It keeps a git clone OUTSIDE
  OneDrive (a .git folder inside a synced folder is asking for trouble), copies the
  staged files over it, commits with the message Claude wrote, and pushes.

  It only ever ADDS or REPLACES the files that are staged. It never mirrors, so a
  file that is in the repository but not in the staging folder is left alone.

  Folders copy as subtrees. The named root files copy to the repository root; COMMIT.txt
  and backups\ never do.

  First run will open a browser once so Git Credential Manager can sign you in to
  GitHub. After that it is silent. No personal access token is created or stored
  by this script.
#>

$ErrorActionPreference = 'Stop'

$Repo    = 'https://github.com/gregcabe/Workboard.git'
$Branch  = 'main'
$Clone   = Join-Path $env:USERPROFILE 'workboard-repo'
$Stage   = Join-Path $env:USERPROFILE 'OneDrive - Revere Plastics Systems LLC\_Claude\Tools\Workboard'
$ClaudeDir = Join-Path $env:USERPROFILE 'OneDrive - Revere Plastics Systems LLC\_Claude'
$Folders = @('connector','docs','migrations','scripts','site','tests','worker')
$RootFiles = @('START-HERE.md','HANDOFF.md','config.json','.gitignore','Build.cmd','Serve-Local.cmd','Test.cmd','Seed-Live.cmd','Backup.cmd','Push-Workboard.cmd','Push-Workboard.ps1','Restore.cmd')

function Say([string]$m, [string]$c='Gray'){ Write-Host $m -ForegroundColor $c }
function Die([string]$m){ Say ''; Say "STOPPED: $m" 'Red'; Say ''; exit 1 }

# Every git call goes through here, and this is why.
#
# git writes ordinary progress to stderr. "From https://github.com/..." after a fetch
# is information, not a failure. PowerShell turns anything a native program writes to
# stderr into an error record as soon as the stream is redirected, and with
# ErrorActionPreference = Stop that error ends the script. So a clean fetch killed the
# run on 19 Sep while the clone before it, which was not redirected, went through fine.
#
# Inside here the preference is relaxed and every line is flattened to a plain string,
# so nothing git says can terminate anything. The exit code decides, which is what it
# is for. $LASTEXITCODE survives the pipeline.
function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)]$GitArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try   { & $gitExe @GitArgs 2>&1 | ForEach-Object { [string]$_ } }
  finally { $ErrorActionPreference = $prev }
}

# Run a git step and, if it fails, PRINT WHAT GIT SAID before stopping.
# "STOPPED: commit failed" with the reason thrown away cost a round trip on
# 19 Sep. A script that hides the one line explaining itself is worse than one
# that never checked.
function Step([string]$what, [string[]]$gitArgs, [switch]$Show){
  $out = Invoke-Git @gitArgs
  if($LASTEXITCODE -ne 0){
    Say ''
    $shown = ($gitArgs | ForEach-Object { if($_.Length -gt 40){ '<' + $_.Length + ' chars>' } else { $_ } }) -join ' '
    Say ("git " + $shown + " said:") 'Yellow'
    if($out){ $out | ForEach-Object { Say ("  " + $_) } } else { Say '  (nothing)' }
    if($script:InClone){ Pop-Location; $script:InClone = $false }
    Die $what
  }
  if($Show -and $out){ $out | ForEach-Object { Say ("  " + $_) } }
  return $out
}
$script:InClone = $false

Say ''
Say 'Push-Workboard - Tools\Workboard to GitHub' 'Cyan'
Say ''

# --- 1. find git -------------------------------------------------------------
# Order: a path you wrote down, then PATH, then the usual portable and per-user
# locations. A portable extract needs no admin and no installer, and it ships
# with Git Credential Manager, so signing in to GitHub works the same way.
$gitExe = $null
$noteFile = Join-Path $ClaudeDir 'git-path.txt'
$candidates = @()
if(Test-Path -LiteralPath $noteFile){
  $told = (Get-Content -LiteralPath $noteFile | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1)
  if($told){
    $told = $told.Trim().Trim('"')
    # accept either the folder you extracted to or the full path to git.exe
    $candidates += $told
    $candidates += (Join-Path $told 'git.exe')
    $candidates += (Join-Path $told 'cmd\git.exe')
  }
}
$onPath = Get-Command git -ErrorAction SilentlyContinue
if($onPath){ $candidates += $onPath.Source }
$candidates += @(
  (Join-Path $env:USERPROFILE 'PortableGit\cmd\git.exe'),
  (Join-Path $env:USERPROFILE 'Downloads\PortableGit\cmd\git.exe'),
  (Join-Path $env:USERPROFILE 'Desktop\PortableGit\cmd\git.exe'),
  (Join-Path $env:USERPROFILE 'Documents\PortableGit\cmd\git.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'),
  'C:\Program Files\Git\cmd\git.exe'
)
foreach($c in $candidates){
  if($c -and (Test-Path -LiteralPath $c) -and ((Get-Item -LiteralPath $c).PSIsContainer -eq $false)){ $gitExe = $c; break }
}

if(-not $gitExe){
  Say 'git was not found on this machine.' 'Yellow'
  Say ''
  Say 'Two ways to fix it, from https://git-scm.com/download/win :' 'Cyan'
  Say ''
  Say '  1. The standard 64-bit installer. On the "Select Destination Location"'
  Say '     step it can install into your own user folder, which does not need'
  Say '     admin rights. Accept every other default.'
  Say ''
  Say '  2. If that is blocked, the portable build: PortableGit-<version>-64-bit.7z.exe'
  Say '     It is a self-extracting archive, not an installer. Run it and point it'
  Say '     at a folder you own, for example:'
  Say ("       " + (Join-Path $env:USERPROFILE 'PortableGit'))
  Say '     Nothing is installed, no registry, no admin. It includes Git Credential'
  Say '     Manager, so GitHub sign-in works the same.'
  Say ''
  Say '  If you extract it somewhere else, put that folder on the first line of:' 'Cyan'
  Say ("    " + $noteFile)
  Say '  and this script will find it.'
  Die 'no git'
}

# put git on PATH for this run so its helpers resolve
$gitDir = Split-Path $gitExe -Parent
if(($env:PATH -split ';') -notcontains $gitDir){ $env:PATH = $gitDir + ';' + $env:PATH }
Say ("git       : " + ((Invoke-Git --version) -join " ") + "  [" + $gitExe + "]")

# --- 2. can we reach github --------------------------------------------------
try {
  $r = Invoke-WebRequest -Uri 'https://github.com' -Method Head -TimeoutSec 15 -UseBasicParsing
  Say ("github    : reachable (" + $r.StatusCode + ")")
} catch {
  Say 'github.com could not be reached from this machine.' 'Yellow'
  Say 'If it opens in your browser but not here, the network is allowing the'
  Say 'browser only, and this script cannot be the answer. Tell Claude.'
  Die 'no route to github.com'
}

# --- 3. staging folder -------------------------------------------------------
if(-not (Test-Path -LiteralPath $Stage)){ Die "staging folder not found: $Stage" }
Say ("staging   : " + $Stage)

# --- 4. clone or refresh -----------------------------------------------------
if(-not (Test-Path -LiteralPath (Join-Path $Clone '.git'))){
  Say ''
  Say "First run: cloning into $Clone" 'Cyan'
  Say 'A browser window may open so you can sign in to GitHub. That is expected.'
  Step 'clone failed' @('clone', $Repo, $Clone) -Show | Out-Null
  Push-Location $Clone
  Invoke-Git rev-parse --verify HEAD | Out-Null
  if($LASTEXITCODE -ne 0){
    # empty repository: no branch exists yet, make main here
    Invoke-Git checkout -b $Branch | Out-Null
    Say 'Repository was empty: created branch main.'
  }
  Pop-Location
} else {
  Push-Location $Clone
  Step 'fetch failed' @('fetch', 'origin', $Branch) | Out-Null
  # --ff-only on purpose: if the histories have diverged, something else has
  # committed and a silent merge is the wrong thing for a script to decide.
  Invoke-Git merge --ff-only ("origin/" + $Branch) | Out-Null
  if($LASTEXITCODE -ne 0){
    Pop-Location
    Die "the local clone at $Clone has diverged from GitHub. Sort it out there by hand, then run this again."
  }
  Pop-Location
}
Say ("clone     : " + $Clone)

# --- 5. copy the staged folders over the clone -------------------------------
$copied = 0
foreach($f in $Folders){
  $src = Join-Path $Stage $f
  if(-not (Test-Path -LiteralPath $src)){ continue }
  $dst = Join-Path $Clone $f
  # /E subdirectories, NO /MIR: never delete anything the staging folder omits
  & robocopy $src $dst /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if($LASTEXITCODE -ge 8){ Die "copy failed for $f" }
  $copied++
}
# Root files are copied by name, so COMMIT.txt and backups\ are never swept in.
foreach($rf in $RootFiles){
  $src = Join-Path $Stage $rf
  if(Test-Path -LiteralPath $src){ Copy-Item -LiteralPath $src -Destination (Join-Path $Clone $rf) -Force; $copied++ }
}
if($copied -eq 0){ Die "none of the expected folders were in the staging folder" }

# --- 6. anything to commit? --------------------------------------------------
Push-Location $Clone; $script:InClone = $true
$changes = Invoke-Git status --porcelain
if(-not $changes){
  Pop-Location
  Say ''
  Say 'Nothing to push - GitHub already matches the staging folder.' 'Green'
  Say ''
  exit 0
}
Say ''
Say 'Changed:' 'Cyan'
$changes | ForEach-Object { Say ("  " + $_) }

# --- 7. the commit message ---------------------------------------------------
# COMMIT.txt is the plain form: subject on line 1, blank line, body.
# COMMIT-MESSAGE.txt is the one written for the GitHub web form and carries two
# printed headings; strip those and it is the same thing.
$msgFile = Join-Path $Stage 'COMMIT.txt'
$webFile = Join-Path $Stage 'COMMIT-MESSAGE.txt'
$lines = $null
if(Test-Path -LiteralPath $msgFile){
  $lines = Get-Content -LiteralPath $msgFile
} elseif(Test-Path -LiteralPath $webFile){
  $lines = Get-Content -LiteralPath $webFile |
    Where-Object { $_ -notmatch '^(TITLE \(top box\)|DESCRIPTION \(bigger box below\))\s*$' -and $_ -notmatch '^=+\s*$' }
}
if($lines){
  $trimmed = @($lines | ForEach-Object { $_ })
  while($trimmed.Count -gt 0 -and $trimmed[0].Trim() -eq ''){ $trimmed = $trimmed[1..($trimmed.Count-1)] }
  $subject = $trimmed[0]
  $body    = if($trimmed.Count -gt 1){ ($trimmed[1..($trimmed.Count-1)] -join "`n").Trim() } else { '' }
} else {
  $subject = 'chore: update Workboard from Tools\Workboard'
  $body    = ''
}
Say ''
Say ('Commit    : ' + $subject) 'Cyan'

# --- 8. who is committing ----------------------------------------------------
# A fresh git has no author set and refuses to commit, which is what stopped the
# 19 Sep run. Set here for THIS CLONE ONLY, never --global, so nothing outside
# this folder is touched.
$who = ((Invoke-Git config user.email) -join '').Trim()
if(-not $who){
  Invoke-Git config user.name  'Greg Cabe'          | Out-Null
  Invoke-Git config user.email 'gregcabe@gmail.com' | Out-Null
  Say ''
  Say 'No commit author was set, so this clone now uses:' 'Yellow'
  Say '  Greg Cabe <gregcabe@gmail.com>'
  Say '  To use a different one, run this in the clone folder:'
  Say '    git config user.email "you@example.com"'
}

# --- 9. commit and push ------------------------------------------------------
Step 'could not stage the changes' @('add', '-A') | Out-Null
# The message goes through a file, not through arguments.
#
# PowerShell 5 re-quotes arguments on their way to a native program and splits
# them at any double quote inside. A commit body containing "STOPPED: commit
# failed" arrived at git as several arguments, and git read the fragments as
# pathspecs. -F is immune to all of it, and to newlines, semicolons, backticks
# and everything else a written paragraph contains.
$msgPath = Join-Path ([System.IO.Path]::GetTempPath()) ('workboard-commit-' + [guid]::NewGuid().ToString('N') + '.txt')
$full = if($body){ $subject + "`n`n" + $body } else { $subject }
[System.IO.File]::WriteAllText($msgPath, $full, (New-Object System.Text.UTF8Encoding $false))
try {
  Step 'commit failed' @('commit', '-q', '-F', $msgPath) | Out-Null
} finally {
  Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
Step 'push failed - if it asked for a password, GitHub no longer accepts one; let Git Credential Manager sign you in through the browser instead' @('push', '-u', 'origin', $Branch) -Show | Out-Null
$sha = ((Invoke-Git rev-parse --short HEAD) -join "").Trim()
Pop-Location; $script:InClone = $false

Say ''
Say ("Pushed " + $sha + " to " + $Branch) 'Green'
Say 'https://github.com/gregcabe/workboard/commits/main'
Say ''
Say 'This is version control only. The Workers are pasted by hand; see START-HERE.md.'
Say ''
