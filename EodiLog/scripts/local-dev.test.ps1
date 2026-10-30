# Isolated command regression tests. Does not execute local-dev.ps1 or read .env.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptFile = Join-Path $PSScriptRoot 'local-dev.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptFile,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'PowerShell parser regression.' }
foreach ($name in @('Invoke-NativeQuiet','Invoke-Compose','Write-ServerState','Register-StartedServer','Get-OwnedServer','Convert-DatabaseSettings','Get-SafeRemediation')) {
    $definition = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
    . ([scriptblock]::Create($definition.Extent.Text))
}
$testDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) '.local-dev\script-tests'
New-Item -ItemType Directory -Path $testDirectory -Force | Out-Null
$fakeNative = Join-Path $testDirectory 'native-progress.cmd'
[IO.File]::WriteAllText($fakeNative,"@echo off`r`necho fake-native-progress 1>&2`r`nif `"%~1`"==`"fail`" exit /b 7`r`nexit /b 0`r`n",[Text.Encoding]::ASCII)
$success = @(Invoke-NativeQuiet -FilePath $fakeNative -Arguments @('success'))
if ($success.Count -ne 1 -or $success[0] -ne 0) { throw 'Successful stderr-producing native command must return only zero.' }
$failure = @(Invoke-NativeQuiet -FilePath $fakeNative -Arguments @('fail'))
if ($failure.Count -ne 1 -or $failure[0] -ne 7) { throw 'Nonzero native exit code must be retained without leaking stderr.' }
if ($ErrorActionPreference -ne 'Stop') { throw 'Native command must restore ErrorActionPreference.' }

# Simulate a PATH that resolves both docker.exe and an extensionless docker.
function Get-Command {
    param([string]$Name,[string]$CommandType,[string]$ErrorAction)
    [pscustomobject]@{Source=$fakeNative}
    [pscustomobject]@{Source=(Join-Path $testDirectory 'must-not-run.cmd')}
}
$duplicateResolution = @(Invoke-NativeQuiet -FilePath 'duplicate-native.exe' -Arguments @('success'))
if ($duplicateResolution.Count -ne 1 -or $duplicateResolution[0] -ne 0) { throw 'Duplicate executable matches must resolve to one executable.' }
Remove-Item Function:\Get-Command

# Check Compose argument forwarding independently of the installed Docker binary.
$script:capturedArguments = $null
function Invoke-NativeQuiet([string]$FilePath,[string[]]$Arguments) {
    if ($FilePath -ne 'docker.exe') { throw 'Unexpected executable.' }
    $script:capturedArguments = $Arguments
    return 0
}
$composeArgs = @('compose','--project-name','fake-project')
Invoke-Compose -Tail @('up','-d','postgres')
if (($script:capturedArguments -join '|') -cne 'compose|--project-name|fake-project|up|-d|postgres') { throw 'Compose argument forwarding regression.' }

# No real .env reads: exercise the actual converter with literal fake settings.
$settings = Convert-DatabaseSettings -Lines @('POSTGRES_DB=','POSTGRES_USER=','POSTGRES_PORT=','POSTGRES_PASSWORD=fake-password')
if ($settings.POSTGRES_DB -ne 'eodilog' -or $settings.POSTGRES_USER -ne 'eodilog' -or $settings.POSTGRES_PORT -ne '5432') { throw 'Empty DB settings must use Compose defaults.' }
$settings = Convert-DatabaseSettings -Lines @('POSTGRES_DB=custom','POSTGRES_USER=custom','POSTGRES_PORT=1234','POSTGRES_PASSWORD=fake-password') -Overrides @{POSTGRES_DB='';POSTGRES_USER='';POSTGRES_PORT=''}
if ($settings.POSTGRES_DB -ne 'eodilog' -or $settings.POSTGRES_USER -ne 'eodilog' -or $settings.POSTGRES_PORT -ne '5432') { throw 'Empty environment overrides must use Compose defaults.' }
foreach ($lines in @(@('POSTGRES_PASSWORD='),@('POSTGRES_PASSWORD=fake # comment'),@('POSTGRES_PASSWORD=fake','POSTGRES_DB=custom # comment'))) {
    $rejected = $false
    try { $null = Convert-DatabaseSettings -Lines $lines } catch { $rejected = $true }
    if (!$rejected) { throw 'Password-required and inline-comment validation regression.' }
}
$safe = Get-SafeRemediation -Failure ([pscustomobject]@{Exception=[Exception]::new('Port 8080 is occupied by an unowned process. It will not be stopped.')})
if ($safe -notmatch '^Port 8080') { throw 'Known safe remediation must be actionable.' }
$unknown = Get-SafeRemediation -Failure ([pscustomobject]@{Exception=[Exception]::new('private-config-secret')})
if ($unknown -match 'private-config-secret') { throw 'Unknown exception message must never be exposed.' }

# Synthetic state is isolated from .local-dev/server.json. Only disposable sleep
# processes are created/killed here; CIM is faked and never queries the real server.
$backend = Join-Path $testDirectory ('backend-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $backend 'build\libs') -Force | Out-Null
$stateFile = Join-Path $backend 'synthetic-server.json'
$fakeJava = 'C:\fake\java.exe'
$fakeJar = Join-Path $backend 'build\libs\backend.jar'
$commandLine = '"' + $fakeJava + '" -jar "' + $fakeJar + '" --spring.profiles.active=local --server.port=8080 '
$script:cimMode = 'valid'
function Get-CimInstance {
    param([string]$ClassName,[string]$Filter)
    if ($script:cimMode -eq 'failure') { throw 'fake-cim-failure' }
    if ($script:cimMode -eq 'executable') { return [pscustomobject]@{ExecutablePath='C:\other\java.exe';CommandLine=$commandLine} }
    if ($script:cimMode -eq 'arguments') { return [pscustomobject]@{ExecutablePath=$fakeJava;CommandLine=($commandLine + '--other')} }
    return [pscustomobject]@{ExecutablePath=$fakeJava;CommandLine=$commandLine}
}
function New-DisposableProcess {
    $shell = Join-Path $PSHOME 'powershell.exe'
    return Start-Process -FilePath $shell -ArgumentList @('-NoLogo','-NoProfile','-Command','Start-Sleep -Seconds 300') -WindowStyle Hidden -PassThru
}
function Assert-NotOwned([string]$Case) {
    $owned = Get-OwnedServer
    if ($null -ne $owned) { $owned.Dispose(); throw ('Unowned synthetic state accepted: ' + $Case) }
}
$disposable = New-DisposableProcess
$unrelated = New-DisposableProcess
try {
    $null = $disposable.Handle
    $null = $unrelated.Handle
    $baseRecord = @{pid=$disposable.Id;startedUtcTicks=$disposable.StartTime.ToUniversalTime().Ticks.ToString();executable=$fakeJava;jar=$fakeJar;commandLine=$commandLine}
    Assert-NotOwned 'missing state'
    [IO.File]::WriteAllText($stateFile,'not-json')
    Assert-NotOwned 'malformed state'
    foreach ($case in @('missing-pid','stale-pid','start-time','outside-jar','recorded-command','executable','arguments','valid')) {
        $record = $baseRecord.Clone()
        $script:cimMode = 'valid'
        switch ($case) {
            'missing-pid' { $record.Remove('pid') }
            'stale-pid' { $record.pid = 2147483647 }
            'start-time' { $record.startedUtcTicks = '1' }
            'outside-jar' { $record.jar = 'C:\elsewhere\backend.jar' }
            'recorded-command' { $record.commandLine = $commandLine.TrimEnd() }
            'executable' { $script:cimMode = 'executable' }
            'arguments' { $script:cimMode = 'arguments' }
        }
        Remove-Item -LiteralPath $stateFile
        Write-ServerState $record
        if ($case -eq 'valid') {
            $owned = Get-OwnedServer
            if ($null -eq $owned -or $owned.Id -ne $disposable.Id) { throw 'Valid trailing-space synthetic state must be owned.' }
            $owned.Dispose()
        } else { Assert-NotOwned $case }
        if ($disposable.HasExited -or $unrelated.HasExited) { throw 'Ownership inspection must not terminate any process.' }
    }
    $existingState = [IO.File]::ReadAllText($stateFile)
    $collisionRejected = $false
    try { Write-ServerState $baseRecord } catch { $collisionRejected = $true }
    if (!$collisionRejected -or [IO.File]::ReadAllText($stateFile) -cne $existingState) { throw 'Atomic state creation must not overwrite an existing record.' }

    # Execute actual registration rollback for CIM and atomic state-write failures.
    foreach ($failureMode in @('cim','state-write')) {
        Remove-Item -LiteralPath $stateFile -ErrorAction SilentlyContinue
        $rollback = New-DisposableProcess
        $observer = [Diagnostics.Process]::GetProcessById($rollback.Id)
        $null = $observer.Handle
        $script:cimMode = if ($failureMode -eq 'cim') { 'failure' } else { 'valid' }
        $originalStateFile = $stateFile
        try {
            if ($failureMode -eq 'state-write') { $stateFile = Join-Path $backend 'missing-directory\server.json' }
            $failed = $false
            try { $null = Register-StartedServer -Server $rollback -Java $fakeJava -Jar $fakeJar }
            catch { $failed = $true }
            if (!$failed -or !$observer.WaitForExit(5000)) { throw 'Registration failure must terminate its disposable process.' }
        } finally {
            $stateFile = $originalStateFile
            if (!$observer.HasExited) { $observer.Kill(); $observer.WaitForExit() }
            $observer.Dispose()
        }
        if ($unrelated.HasExited -or $disposable.HasExited) { throw 'Rollback must preserve unrelated processes.' }
    }
    if (@(Get-ChildItem -LiteralPath $backend -Filter '*.tmp').Count -ne 0) { throw 'Atomic state writes must not leave temporary files.' }
} finally {
    foreach ($item in @($disposable,$unrelated)) {
        if (!$item.HasExited) { $item.Kill(); $item.WaitForExit() }
        $item.Dispose()
    }
}
Write-Output 'PowerShell regressions passed: native commands, parser/defaults, safe errors, actual ownership checks, atomic state writes and isolated process rollback.'
