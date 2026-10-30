param([Parameter(Mandatory=$true)][ValidateSet('up','down','db')][string]$Action)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$backend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime = Join-Path $backend '.local-dev'
$stateFile = Join-Path $runtime 'server.json'
$composeArgs = @('compose','--project-name','eodilog','--project-directory',$backend,'--env-file',(Join-Path $backend '.env'),'-f',(Join-Path $backend 'compose.yaml'))
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
Set-Location -LiteralPath $backend

function Invoke-NativeQuiet([string]$FilePath, [string[]]$Arguments) {
    $command = Get-Command $FilePath -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $previousPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 wraps native stderr (including normal Docker progress)
        # in NativeCommandError. Judge native success by its exit code, never stderr.
        $ErrorActionPreference = 'Continue'
        & $command.Source @Arguments *> $null
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
}
function Invoke-Compose([string[]]$Tail) {
    # Never echo Compose output: interpolated environment values can contain secrets.
    $exitCode = Invoke-NativeQuiet -FilePath 'docker.exe' -Arguments ($composeArgs + $Tail)
    if ($exitCode -ne 0) { throw 'Docker Compose failed. Check Docker Desktop and local DB configuration.' }
}
function Write-ServerState($Record) {
    $temporaryState = $stateFile + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllText($temporaryState,($Record | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
        # The caller has removed stale state under the command lock. A create-only
        # atomic rename also refuses to clobber any unexpectedly existing state.
        [IO.File]::Move($temporaryState,$stateFile)
    } finally {
        if (Test-Path -LiteralPath $temporaryState) { Remove-Item -LiteralPath $temporaryState }
    }
}
function Register-StartedServer($Server,[string]$Java,[string]$Jar) {
    $handleCaptured = $false
    $recordWritten = $false
    try {
        # Retain this invocation's process handle before CIM or filesystem operations.
        $null = $Server.Handle
        $handleCaptured = $true
        $native = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $Server.Id)
        $record = @{pid=$Server.Id; startedUtcTicks=$Server.StartTime.ToUniversalTime().Ticks.ToString(); executable=$Java; jar=$Jar; commandLine=$native.CommandLine}
        Write-ServerState $record
        $recordWritten = $true
        $verified = Get-OwnedServer
        if ($null -eq $verified) { throw 'Started backend identity could not be verified.' }
        return $verified
    } catch {
        # Kill only the captured object/handle returned by our own Start-Process.
        # Never look up a PID for rollback or act on another existing server.
        if ($handleCaptured -and !$Server.HasExited) { $Server.Kill(); $Server.WaitForExit() }
        if ($recordWritten -and (Test-Path -LiteralPath $stateFile)) { Remove-Item -LiteralPath $stateFile }
        throw 'Backend ownership recording failed. The process started by this invocation was rolled back.'
    } finally { $Server.Dispose() }
}
function Get-OwnedServer {
    if (!(Test-Path -LiteralPath $stateFile)) { return $null }
    $process = $null
    try {
        $record = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $expectedJar = [IO.Path]::GetFullPath([string]$record.jar)
        $lib = [IO.Path]::GetFullPath((Join-Path $backend 'build\libs')) + [IO.Path]::DirectorySeparatorChar
        if (!$expectedJar.StartsWith($lib,[StringComparison]::OrdinalIgnoreCase) -or !$expectedJar.EndsWith('.jar') -or $expectedJar.EndsWith('-plain.jar')) { return $null }
        $process = [Diagnostics.Process]::GetProcessById([int]$record.pid)
        # Force a handle open before checking identity, so PID reuse cannot redirect Kill().
        $null = $process.Handle
        if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$record.startedUtcTicks) { $process.Dispose(); return $null }
        $native = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$record.pid)
        if (!$native -or !$native.ExecutablePath -or ![string]::Equals($native.ExecutablePath,[string]$record.executable,[StringComparison]::OrdinalIgnoreCase)) { $process.Dispose(); return $null }
        # Require precisely our captured invocation AND the exact quoted absolute jar path.
        $arguments = ' -jar "' + $expectedJar + '" --spring.profiles.active=local --server.port=8080'
        $validCommands = @(('"' + [string]$record.executable + '"' + $arguments),([string]$record.executable + $arguments))
        if ($validCommands -cnotcontains ([string]$native.CommandLine).TrimEnd() -or ![string]::Equals($native.CommandLine,[string]$record.commandLine,[StringComparison]::Ordinal)) { $process.Dispose(); return $null }
        return $process
    } catch { if ($null -ne $process) { $process.Dispose() }; return $null }
}
function Wait-Server($Process) {
    for ($i=0; $i -lt 90; $i++) {
        if ($Process.HasExited) { throw 'Backend exited. Inspect .local-dev/server.err.log and server.out.log locally.' }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080/dev/kakao-login' -TimeoutSec 2
            $listener = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -eq $Process.Id })
            if (!$Process.HasExited -and $listener.Count -gt 0 -and $response.StatusCode -eq 200 -and $response.Content.Contains('eodilog.local.kakao.attempt')) { return }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw 'Backend readiness timed out. Inspect .local-dev logs locally; run dev-down before retrying.'
}
function Start-Database {
    if (!(Test-Path -LiteralPath (Join-Path $backend '.env'))) { throw 'Create EodiLog/.env using .env.example first.' }
    Invoke-Compose -Tail @('up','-d','postgres')
    for ($i=0; $i -lt 60; $i++) {
        # Container-side variables avoid putting credentials on the host command line.
        $exitCode = Invoke-NativeQuiet -FilePath 'docker.exe' -Arguments ($composeArgs + @('exec','-T','postgres','sh','-c','pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'))
        if ($exitCode -eq 0) { Write-Host 'Compose DB accepts connections (credentials not validated; data volume preserved).'; return }
        Start-Sleep -Seconds 1
    }
    throw 'Database readiness timed out.'
}
function Read-DatabaseSettings {
    if (!(Test-Path -LiteralPath (Join-Path $backend '.env'))) { throw 'Create EodiLog/.env using .env.example first.' }
    $overrides = @{}
    foreach ($name in @('POSTGRES_DB','POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_PORT')) {
        $override = [Environment]::GetEnvironmentVariable($name,'Process')
        if ($null -ne $override) { $overrides[$name] = $override }
    }
    return Convert-DatabaseSettings -Lines ([IO.File]::ReadAllLines((Join-Path $backend '.env'))) -Overrides $overrides
}
function Convert-DatabaseSettings([string[]]$Lines,[hashtable]$Overrides=@{}) {
    $values = @{POSTGRES_DB='eodilog'; POSTGRES_USER='eodilog'; POSTGRES_PORT='5432'}
    # .env is documented as Java properties: plain unquoted values, no evaluation.
    foreach ($line in $Lines) {
        if ($line -match '^\s*(POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_PORT)\s*=(.*)$') {
            if ($matches[2] -match '\s+#') { throw 'DB settings must not contain whitespace-prefixed inline comments.' }
            $values[$matches[1]] = $matches[2].Trim()
        }
    }
    foreach ($name in $Overrides.Keys) { $values[$name] = $Overrides[$name] }
    foreach ($name in @('POSTGRES_DB','POSTGRES_USER','POSTGRES_PORT')) {
        if ([string]::IsNullOrEmpty($values[$name])) { $values[$name] = @{POSTGRES_DB='eodilog'; POSTGRES_USER='eodilog'; POSTGRES_PORT='5432'}[$name] }
    }
    if (!$values.ContainsKey('POSTGRES_PASSWORD') -or [string]::IsNullOrWhiteSpace($values.POSTGRES_PASSWORD)) { throw 'POSTGRES_PASSWORD is required.' }
    if ($values.POSTGRES_PORT -notmatch '^\d{1,5}$' -or [int]$values.POSTGRES_PORT -lt 1 -or [int]$values.POSTGRES_PORT -gt 65535) { throw 'Invalid POSTGRES_PORT.' }
    # Reject Compose interpolation / properties escapes rather than silently using a different credential.
    foreach ($name in @('POSTGRES_DB','POSTGRES_USER','POSTGRES_PASSWORD')) {
        if ($values[$name] -match '[\r\n\\$"'']') { throw 'DB settings must use plain unquoted .env values without interpolation or escapes.' }
    }
    return $values
}
function Get-SafeRemediation($Failure) {
    switch -CaseSensitive -Exact ($Failure.Exception.Message) {
        'Port 8080 is occupied by an unowned process. It will not be stopped.' { return 'Port 8080 is occupied by another process. Stop it yourself or use its existing server; no process was stopped.' }
        'Create EodiLog/.env using .env.example first.' { return 'Create EodiLog/.env from .env.example and configure the required values.' }
        'POSTGRES_PASSWORD is required.' { return 'Set a nonempty POSTGRES_PASSWORD in EodiLog/.env or the process environment.' }
        'Invalid POSTGRES_PORT.' { return 'Set POSTGRES_PORT to an integer from 1 to 65535.' }
        'DB settings must not contain whitespace-prefixed inline comments.' { return 'Remove inline comments from DB settings; put comments on their own lines.' }
        'DB settings must use plain unquoted .env values without interpolation or escapes.' { return 'Use plain unquoted DB settings without interpolation or escapes.' }
        'Another local development command is running. Retry after it finishes.' { return 'Another local development command holds the lock. Retry after it finishes.' }
        'Docker Compose failed. Check Docker Desktop and local DB configuration.' { return 'Check Docker Desktop and the local Compose DB configuration, then retry.' }
        'Database readiness timed out.' { return 'The DB did not accept connections before the deadline. Check Docker Desktop and the postgres container locally.' }
        'bootJar failed. Inspect .local-dev/build.log locally.' { return 'The backend build failed. Inspect .local-dev/build.log locally.' }
        'Expected exactly one main jar in build/libs (excluding -plain).' { return 'Rebuild so build/libs contains exactly one main jar, excluding -plain.jar.' }
        'JAVA_HOME does not contain bin/java.exe.' { return 'Point JAVA_HOME to a Java 25 installation containing bin/java.exe.' }
        'Backend exited. Inspect .local-dev/server.err.log and server.out.log locally.' { return 'The backend exited. Inspect .local-dev/server.err.log and server.out.log locally.' }
        'Backend process could not be started.' { return 'The backend could not start. Check Java 25, JAVA_HOME and .local-dev log permissions before retrying.' }
        'Backend readiness timed out. Inspect .local-dev logs locally; run dev-down before retrying.' { return 'Backend readiness timed out. Inspect .local-dev logs locally; run dev-down before retrying.' }
        'Backend ownership recording failed. The process started by this invocation was rolled back.' { return 'Backend ownership recording failed and the newly started process was rolled back. Check .local-dev permissions before retrying.' }
        default { return 'Check Java 25, Docker Desktop, file permissions and .local-dev logs locally before retrying.' }
    }
}

$lock = $null
try {
    try { $lock = [IO.File]::Open((Join-Path $runtime 'command.lock'),'OpenOrCreate','ReadWrite','None') }
    catch { throw 'Another local development command is running. Retry after it finishes.' }
    $owned = Get-OwnedServer
    if ($Action -eq 'down') {
        if ($null -ne $owned) { $owned.Kill(); $owned.WaitForExit(); $owned.Dispose(); Write-Host 'Owned backend stopped.' }
        else { Write-Host 'No verified owned backend; other processes were left running.' }
        if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
        Invoke-Compose -Tail @('stop','postgres')
        Write-Host 'Compose DB stopped. Data volume preserved.'
    } elseif ($Action -eq 'db') {
        Start-Database
    } elseif ($null -ne $owned) {
        Wait-Server $owned
        $owned.Dispose()
        Write-Host 'Backend already running. http://localhost:8080/dev/kakao-login (awaiting user authentication)'
    } else {
        if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
        if (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue) { throw 'Port 8080 is occupied by an unowned process. It will not be stopped.' }
        $settings = Read-DatabaseSettings
        Start-Database
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & (Join-Path $backend 'gradlew.bat') bootJar --console=plain *> (Join-Path $runtime 'build.log')
        } finally { $ErrorActionPreference = $previousPreference }
        if ($LASTEXITCODE -ne 0) { throw 'bootJar failed. Inspect .local-dev/build.log locally.' }
        $jars = @(Get-ChildItem -LiteralPath (Join-Path $backend 'build\libs') -Filter '*.jar' | Where-Object { !$_.Name.EndsWith('-plain.jar') })
        if ($jars.Count -ne 1) { throw 'Expected exactly one main jar in build/libs (excluding -plain).' }
        $jar = $jars[0].FullName
        if ($env:JAVA_HOME) {
            $java = Join-Path $env:JAVA_HOME 'bin\java.exe'
            if (!(Test-Path -LiteralPath $java)) { throw 'JAVA_HOME does not contain bin/java.exe.' }
        } else { $java = (Get-Command java.exe -CommandType Application | Select-Object -First 1).Source }
        $envValues = @{
            SPRING_DATASOURCE_URL=('jdbc:postgresql://localhost:' + $settings.POSTGRES_PORT + '/' + [Uri]::EscapeDataString($settings.POSTGRES_DB));
            SPRING_DATASOURCE_USERNAME=$settings.POSTGRES_USER;
            SPRING_DATASOURCE_PASSWORD=$settings.POSTGRES_PASSWORD;
            SPRING_DOCKER_COMPOSE_ENABLED='false'
        }
        $previous = @{}
        try {
            foreach ($name in $envValues.Keys) { $previous[$name] = [Environment]::GetEnvironmentVariable($name,'Process'); [Environment]::SetEnvironmentVariable($name,$envValues[$name],'Process') }
            try {
                $server = Start-Process -FilePath $java -ArgumentList @('-jar',('"' + $jar + '"'),'--spring.profiles.active=local','--server.port=8080') -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'server.out.log') -RedirectStandardError (Join-Path $runtime 'server.err.log') -PassThru
            } catch { throw 'Backend process could not be started.' }
        } finally {
            foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') }
        }
        $verified = Register-StartedServer -Server $server -Java $java -Jar $jar
        Wait-Server $verified
        $verified.Dispose()
        Write-Host 'Backend ready. http://localhost:8080/dev/kakao-login (awaiting user authentication)'
    }
} catch {
    # Exact lookup emits only predefined text. Unknown messages are never printed.
    $remediation = Get-SafeRemediation -Failure $_
    Write-Host $remediation
    Write-Host ('Local development command failed. ErrorType={0}; Line={1}' -f $_.Exception.GetType().FullName, $_.InvocationInfo.ScriptLineNumber)
    exit 1
} finally { if ($null -ne $lock) { $lock.Dispose() } }
