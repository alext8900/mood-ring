# Registers this folder with Claude Code on Windows: adds it to CLAUDE_CODE_PLUGIN_DIRS and turns on
# CLAUDE_CODE_ENABLE_FUNCTION_HOOKS in the env block of %USERPROFILE%\.claude\settings.json.
# Backs the file up first and leaves every other setting alone. Run it again any time; it is idempotent.
# Pass -Uninstall to remove the folder from CLAUDE_CODE_PLUGIN_DIRS again.
# The Windows counterpart of install.sh. Needs only Windows PowerShell 5.1, no Python.
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$ModDir = $PSScriptRoot
$ConfigDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
$Settings = Join-Path $ConfigDir 'settings.json'
# Windows paths contain ':' (C:\...), so the list is separated with ';', like PATH.
$Sep = ';'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Set-Prop($Obj, $Name, $Value) {
  if ($Obj.PSObject.Properties[$Name]) { $Obj.$Name = $Value }
  else { $Obj | Add-Member -NotePropertyName $Name -NotePropertyValue $Value }
}

function Test-SameDir($A, $B) {
  $A.TrimEnd('\', '/') -ieq $B.TrimEnd('\', '/')
}

# Windows PowerShell 5.1 indents ConvertTo-Json output unevenly and escapes ' < > & as \uXXXX.
# Re-indent its compact output with two spaces and put those four characters back.
function Format-Json([string]$Json) {
  $out = New-Object System.Text.StringBuilder
  $depth = 0
  $inString = $false
  for ($i = 0; $i -lt $Json.Length; $i++) {
    $c = $Json[$i]
    if ($inString) {
      if ($c -eq '\') {
        $hex = if ($i + 5 -lt $Json.Length -and $Json[$i + 1] -eq 'u') { $Json.Substring($i + 2, 4) } else { '' }
        if ($hex -in '0027', '003c', '003e', '0026') {
          [void]$out.Append([char][Convert]::ToInt32($hex, 16))
          $i += 5
        } else {
          [void]$out.Append($Json, $i, 2)
          $i++
        }
        continue
      }
      if ($c -eq '"') { $inString = $false }
      [void]$out.Append($c)
    } elseif ($c -eq '"') {
      $inString = $true
      [void]$out.Append($c)
    } elseif ($c -eq '{' -or $c -eq '[') {
      $close = if ($c -eq '{') { '}' } else { ']' }
      if ($i + 1 -lt $Json.Length -and $Json[$i + 1] -eq $close) {
        [void]$out.Append("$c$close")
        $i++
        continue
      }
      $depth++
      [void]$out.Append($c).Append("`n" + '  ' * $depth)
    } elseif ($c -eq '}' -or $c -eq ']') {
      $depth--
      [void]$out.Append("`n" + '  ' * $depth).Append($c)
    } elseif ($c -eq ',') {
      [void]$out.Append(",`n" + '  ' * $depth)
    } elseif ($c -eq ':') {
      [void]$out.Append(': ')
    } elseif (-not [char]::IsWhiteSpace($c)) {
      [void]$out.Append($c)
    }
  }
  $out.ToString()
}

New-Item -ItemType Directory -Force $ConfigDir | Out-Null
if (-not (Test-Path $Settings)) { [IO.File]::WriteAllText($Settings, '{}', $Utf8NoBom) }
$Backup = "$Settings.bak-mood-ring-$(Get-Date -Format yyyyMMdd-HHmmss)"
# Two runs in the same second would otherwise overwrite the older, more original backup.
if (-not (Test-Path $Backup)) { Copy-Item $Settings $Backup }

$raw = [IO.File]::ReadAllText($Settings)
if (-not $raw.Trim()) { $raw = '{}' }
$config = $raw | ConvertFrom-Json

if (-not $config.PSObject.Properties['env']) { Set-Prop $config 'env' ([pscustomobject]@{}) }
$envBlock = $config.env

$current = ''
if ($envBlock.PSObject.Properties['CLAUDE_CODE_PLUGIN_DIRS']) { $current = [string]$envBlock.CLAUDE_CODE_PLUGIN_DIRS }
$dirs = @($current -split [regex]::Escape($Sep) | Where-Object { $_ })

if ($Uninstall) {
  $dirs = @($dirs | Where-Object { -not (Test-SameDir $_ $ModDir) })
  if ($dirs.Count) { Set-Prop $envBlock 'CLAUDE_CODE_PLUGIN_DIRS' ($dirs -join $Sep) }
  else { $envBlock.PSObject.Properties.Remove('CLAUDE_CODE_PLUGIN_DIRS') }
  Write-Host "Removed $ModDir from CLAUDE_CODE_PLUGIN_DIRS."
  Write-Host 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS was left on, in case other mods use it.'
} else {
  if (-not ($dirs | Where-Object { Test-SameDir $_ $ModDir })) { $dirs += $ModDir }
  Set-Prop $envBlock 'CLAUDE_CODE_PLUGIN_DIRS' ($dirs -join $Sep)
  Set-Prop $envBlock 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS' '1'
  Write-Host "mood-ring registered: $ModDir"
}

$json = Format-Json ($config | ConvertTo-Json -Depth 100 -Compress)
[IO.File]::WriteAllText($Settings, $json + "`n", $Utf8NoBom)

if (-not $Uninstall) {
  Write-Host 'Start a new Claude Code session and type /mood to check it loaded.'
}
