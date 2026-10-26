$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot
$demoLectures = Get-Content -LiteralPath 'demo/lectures.json' -Raw -Encoding utf8 | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SelectVoice('Microsoft Irina Desktop')
$voice.Rate = 0
try {
    foreach ($lecture in $demoLectures) {
        $audioDirectory = Join-Path $repoRoot "work/narration/$($lecture.id)"
        New-Item -ItemType Directory -Force -Path $audioDirectory | Out-Null
        for ($partIndex = 0; $partIndex -lt $lecture.segments.Count; $partIndex++) {
            $wavePath = Join-Path $audioDirectory "$partIndex.wav"
            $voice.SetOutputToWaveFile($wavePath)
            $voice.Speak($lecture.segments[$partIndex])
            $voice.SetOutputToNull()
        }
        Write-Output "Narrated $($lecture.id)"
    }
} finally { $voice.Dispose() }
& ./.venv/Scripts/python.exe scripts/assemble_demo.py
if ($LASTEXITCODE -ne 0) { throw 'Demo video assembly failed.' }
