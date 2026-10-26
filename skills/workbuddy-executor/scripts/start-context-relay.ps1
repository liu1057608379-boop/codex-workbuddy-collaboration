param(
  [Parameter(Mandatory=$true)][string]$Plan,
  [Parameter(Mandatory=$true)][string]$Node
)
$ErrorActionPreference = 'Stop'
$planPath = (Resolve-Path -LiteralPath $Plan).Path
$nodePath = (Resolve-Path -LiteralPath $Node).Path
$scriptPath = Join-Path $PSScriptRoot 'context-relay.mjs'
$lockPath = $planPath + '.state.json.lock'
if (Test-Path -LiteralPath $lockPath) { throw 'Relay lock exists. Inspect the recorded owner; do not launch a duplicate.' }
if ($planPath.Contains('"') -or $scriptPath.Contains('"')) { throw 'Unsupported quote in path' }
$process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $scriptPath + '"', '"' + $planPath + '"') -WorkingDirectory (Split-Path -Parent $planPath) -WindowStyle Hidden -RedirectStandardOutput ($planPath + '.stdout.log') -RedirectStandardError ($planPath + '.stderr.log') -PassThru
@{ pid=$process.Id; plan=$planPath; started_at=(Get-Date).ToString('o'); meaning='controller launched; not evidence of task completion' } | ConvertTo-Json | Set-Content -LiteralPath ($planPath + '.launcher.json') -Encoding utf8
Write-Output ('Controller PID: ' + $process.Id)
