@echo off
cd /d D:\uppsc_pyq
echo Testing PowerShell TTS (Windows built-in voice)...
echo.
powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = -1; $s.SetOutputToWaveFile('D:\uppsc_pyq\test_tts.wav'); $s.Speak('UPPSC Daily Quiz. This is a test of Windows voice narration.'); $s.SetOutputToDefaultAudioDevice(); Write-Host 'TTS done.'"
echo.
if exist test_tts.wav (
    for %%A in (test_tts.wav) do echo File size: %%~zA bytes
    echo SUCCESS - Windows TTS is working!
    echo Playing audio now...
    powershell -c "(New-Object Media.SoundPlayer 'D:\uppsc_pyq\test_tts.wav').PlaySync()"
) else (
    echo FAIL - no wav file created
)
pause
