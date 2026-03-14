#!/usr/bin/env python3
"""
Local Whisper transcription script for CUB AI.
Usage: python3 whisper_transcribe.py <wav_file> [model_size]
Prints the transcribed text to stdout.
"""
import sys
import whisper

wav_file = sys.argv[1]
model_size = sys.argv[2] if len(sys.argv) > 2 else 'base'

model = whisper.load_model(model_size)
result = model.transcribe(wav_file, fp16=False)
print(result['text'].strip())
