@echo off
cd /d D:\uppsc_pyq
echo Testing TTS audio on Windows...
pip install pyttsx3 -q
python -c "
import pyttsx3, os, wave

engine = pyttsx3.init()
print('TTS engine:', engine)
voices = engine.getProperty('voices')
print('Available voices:')
for v in voices:
    print(' -', v.name, v.id)

engine.setProperty('rate', 155)
engine.save_to_file('UPPSC Daily Quiz. This is a test of audio narration.', 'test_voice.wav')
engine.runAndWait()

if os.path.exists('test_voice.wav'):
    size = os.path.getsize('test_voice.wav')
    print(f'Audio file created: test_voice.wav ({size} bytes)')
    if size > 1000:
        print('SUCCESS - TTS is working!')
    else:
        print('FAIL - file too small, TTS may not be working')
else:
    print('FAIL - no file created')
"
echo.
echo If SUCCESS above, run_reels.bat will include audio.
echo If FAIL, we need to fix TTS first.
pause
