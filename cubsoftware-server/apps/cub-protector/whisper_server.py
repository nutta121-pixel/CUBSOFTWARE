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

Install: pip install faster-whisper --break-system-packages

Accepts WAV file paths via stdin (one per line), writes transcription to stdout (one per line).
"""
import sys
import os
import multiprocessing

model_size = sys.argv[1] if len(sys.argv) > 1 else 'tiny'
# English-only model is faster and more accurate for English speech
# e.g. 'tiny' -> 'tiny.en', 'base' -> 'base.en'
if not model_size.endswith('.en') and model_size in ('tiny', 'base', 'small', 'medium'):
    model_size = model_size + '.en'

cpu_threads = max(2, min(multiprocessing.cpu_count(), 8))

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'whisper_models')

def load_model(size):
    # Try faster-whisper with OpenVINO (fastest)
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

        # Try faster-whisper on CPU
        sys.stderr.write(f'[whisper_server] Loading {size} (faster-whisper CPU int8, {cpu_threads} threads)...\n')
        sys.stderr.flush()
        m = WhisperModel(size, device='cpu', compute_type='int8',
                         cpu_threads=cpu_threads, num_workers=1,
                         download_root=MODEL_DIR)
        return m, 'faster-whisper-cpu'

    except ImportError:
        sys.stderr.write('[whisper_server] faster-whisper not installed, falling back to openai-whisper\n')
        sys.stderr.write('[whisper_server] Run: pip install faster-whisper --break-system-packages\n')
        sys.stderr.flush()

    # Fall back to original openai-whisper
    import whisper
    # strip .en suffix — openai-whisper uses plain model names
    plain = size.replace('.en', '')
    sys.stderr.write(f'[whisper_server] Loading {plain} (openai-whisper)...\n')
    sys.stderr.flush()
    return whisper.load_model(plain), 'openai-whisper'

model, backend = load_model(model_size)
sys.stderr.write(f'[whisper_server] Ready ({backend})\n')
sys.stderr.flush()

sys.stderr.write('[whisper_server] Ready\n')
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
