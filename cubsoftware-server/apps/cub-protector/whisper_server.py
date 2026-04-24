#!/usr/bin/env python3
"""
Persistent Whisper server for CUB AI — maximum speed configuration.

Uses faster-whisper with CTranslate2 int8 quantization + all speed optimizations:
  - tiny.en  (English-only model, faster than multilingual tiny)
  - int8      (8-bit quantization, 4-6x faster than float32)
  - vad_filter (silero-VAD pre-pass skips silence instantly)
  - beam_size=1, temperature=0 (greedy decoding, no beam search)
  - condition_on_previous_text=False (no context lookup overhead)
  - cpu_threads tuned to available cores

Accepts WAV file paths via stdin (one per line), writes transcription to stdout (one per line).
"""
import sys
import os
import subprocess
import importlib
import multiprocessing

model_size = sys.argv[1] if len(sys.argv) > 1 else 'tiny'
if not model_size.endswith('.en') and model_size in ('tiny', 'base', 'small', 'medium'):
    model_size = model_size + '.en'

cpu_threads = max(2, min(multiprocessing.cpu_count(), 8))
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'whisper_models')

def _pip_install(package):
    sys.stderr.write(f'[whisper_server] Auto-installing {package}, please wait...\n')
    sys.stderr.flush()
    result = subprocess.run(
        [sys.executable, '-m', 'pip', 'install', package, '--break-system-packages', '--quiet'],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    if result.returncode == 0:
        importlib.invalidate_caches()
        sys.stderr.write(f'[whisper_server] {package} installed OK\n')
        sys.stderr.flush()
        return True
    sys.stderr.write(f'[whisper_server] Failed to install {package}: {result.stderr.decode().strip()}\n')
    sys.stderr.flush()
    return False

def load_model(size):
    # ── Attempt 1 & 2: faster-whisper (auto-install if missing) ──────────────
    for attempt in range(2):
        try:
            from faster_whisper import WhisperModel
            try:
                m = WhisperModel(size, device='openvino', compute_type='int8',
                                 download_root=MODEL_DIR)
                sys.stderr.write(f'[whisper_server] Loading {size} (faster-whisper + OpenVINO int8)...\n')
                sys.stderr.flush()
                return m, 'faster-whisper-openvino'
            except Exception:
                pass
            sys.stderr.write(f'[whisper_server] Loading {size} (faster-whisper CPU int8, {cpu_threads} threads)...\n')
            sys.stderr.flush()
            m = WhisperModel(size, device='cpu', compute_type='int8',
                             cpu_threads=cpu_threads, num_workers=1,
                             download_root=MODEL_DIR)
            return m, 'faster-whisper-cpu'
        except ImportError:
            if attempt == 0 and _pip_install('faster-whisper'):
                continue
            sys.stderr.write('[whisper_server] faster-whisper unavailable, falling back to openai-whisper\n')
            sys.stderr.flush()
            break

    # ── Attempt 3 & 4: openai-whisper (auto-install if missing) ──────────────
    for attempt in range(2):
        try:
            import whisper
            plain = size.replace('.en', '')
            sys.stderr.write(f'[whisper_server] Loading {plain} (openai-whisper)...\n')
            sys.stderr.flush()
            return whisper.load_model(plain), 'openai-whisper'
        except ImportError:
            if attempt == 0 and _pip_install('openai-whisper'):
                continue
            sys.stderr.write('[whisper_server] openai-whisper unavailable — no Whisper backend found\n')
            sys.stderr.flush()
            break

    raise RuntimeError('No Whisper backend could be loaded. Install faster-whisper or openai-whisper manually.')

model, backend = load_model(model_size)
sys.stderr.write(f'[whisper_server] Ready ({backend})\n')
sys.stderr.flush()

for line in sys.stdin:
    wav_path = line.strip()
    if not wav_path:
        continue
    try:
        if backend == 'openai-whisper':
            result = model.transcribe(wav_path, fp16=False, language='en')
            text = result['text'].strip()
        else:
            segments, _ = model.transcribe(
                wav_path,
                language='en',
                task='transcribe',
                beam_size=1,
                best_of=1,
                temperature=0,
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=300, speech_pad_ms=100),
                no_speech_threshold=0.7,
                compression_ratio_threshold=2.4,
                word_timestamps=False,
            )
            text = ' '.join(s.text for s in segments).strip()
        sys.stdout.write(text + '\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write('\n')
        sys.stdout.flush()
        sys.stderr.write(f'[whisper_server] Error: {e}\n')
        sys.stderr.flush()
