# A tinny, slightly broken music box that winds down (appended after "Yoooo" on night 4)
import numpy as np, wave, sys
sr = 44100
notes = [523, 659, 784, 659, 587, 523, 587, 659, 523, 392, 440, 523, 494, 440, 392, 392, 523, 659, 784, 880, 784, 659]
out = np.zeros(int(sr * 9.5))
t0 = 0.0
rng = np.random.default_rng(4)
for i, f in enumerate(notes):
    step = 0.3 * (1 + max(0, i - 12) * 0.09)          # winding down
    f = f * (1 - max(0, i - 14) * 0.012) * (1 + rng.uniform(-0.006, 0.006))  # sagging pitch
    n = int(sr * 1.4); t = np.arange(n) / sr
    tone = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 9) + 0.12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 16))
    env = np.exp(-t * 4.2) * np.minimum(1, t * 400)
    s = int(t0 * sr)
    seg = (tone * env * 0.28)[: max(0, len(out) - s)]
    out[s:s + len(seg)] += seg
    t0 += step
    if t0 > 8.6: break
out = out[: int(sr * (t0 + 0.8))]
out /= max(1e-6, np.abs(out).max() / 0.8)
pcm = (out * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
print('music box', round(len(out) / sr, 2), 's')
