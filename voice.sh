#!/bin/bash
# Turn a raw recording into a crunchy, lo-fi FNAF phone line (voice/out/nightN.mp3)
# usage: tools/voice.sh <input> <night>
set -e
IN="$1"; N="$2"; OUT="voice/out/night$N.mp3"
ffmpeg -y -hide_banner -loglevel error -i "$IN" -filter_complex "
[0:a]aformat=channel_layouts=mono,aresample=44100,afftdn=nr=12:nf=-45,
highpass=f=420,highpass=f=420,lowpass=f=2900,lowpass=f=2900,
equalizer=f=1500:t=q:w=1.0:g=7,
acompressor=threshold=-26dB:ratio=9:attack=3:release=70:makeup=9,
asoftclip=type=tanh:threshold=0.5,
aresample=7000,aresample=44100,
acrusher=bits=7:mix=0.42:mode=log:aa=0.3,
highpass=f=380,lowpass=f=3100,
dynaudnorm=f=180:g=9:p=0.8[v];
anoisesrc=color=pink:amplitude=0.05:sample_rate=44100,highpass=f=350,lowpass=f=3800,volume=0.55[n];
anoisesrc=color=white:amplitude=1:sample_rate=44100,volume=0.02,highpass=f=1800,lowpass=f=5000[h];
sine=f=50:sample_rate=44100,volume=0.006[hum];
[n][h][hum]amix=inputs=3:normalize=0[bg];
[v][bg]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.92[o]" \
  -map "[o]" -ac 1 -ar 22050 -c:a libmp3lame -b:a 48k "$OUT"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | xargs printf "night $N: %.1fs  "
du -h "$OUT" | cut -f1
