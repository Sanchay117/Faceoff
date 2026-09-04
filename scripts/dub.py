"""
Dub the demo with a neural voice, without breaking sync.

The footage was recorded by performing against the macOS `say` track, so its
timing is baked into the video. A different voice cannot simply be swapped in:
line lengths differ and the narration drifts away from the action.

So this pins every line to the START TIME it had in the original. Each line is
synthesised with edge-tts, and if the new reading runs longer than the window it
has to live in, it is gently sped up to fit rather than allowed to push
everything after it. Sync is preserved by construction.

    python3 scripts/dub.py [voice]

Reads voiceover/timeline.json (written by `npm run voiceover`) and
voiceover/raw.mov, and writes voiceover/faceoff-demo.mp4.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-GB-RyanNeural"
OUT_DIR = "voiceover"
TIMELINE = os.path.join(OUT_DIR, "timeline.json")
VIDEO = os.path.join(OUT_DIR, "raw.mov")
AUDIO_OUT = os.path.join(OUT_DIR, "faceoff-vo-neural.m4a")
FINAL = os.path.join(OUT_DIR, "faceoff-demo.mp4")

SR = 44100


def run(*args):
    subprocess.run(args, check=True, capture_output=True)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def main():
    segments = json.load(open(TIMELINE))
    work = tempfile.mkdtemp(prefix="dub-")
    pieces = []
    stretched = 0

    try:
        for i, seg in enumerate(segments):
            start = seg["startSec"]
            # How long this line may run before it would collide with the next.
            nxt = segments[i + 1]["startSec"] if i + 1 < len(segments) else start + seg["spokenSec"] + seg["pause"]
            window = nxt - start

            mp3 = os.path.join(work, f"s{i}.mp3")
            subprocess.run(
                [sys.executable, "-m", "edge_tts", "--voice", VOICE,
                 "--text", seg["text"], "--write-media", mp3],
                check=True, capture_output=True,
            )

            wav = os.path.join(work, f"s{i}.wav")
            run("ffmpeg", "-y", "-loglevel", "error", "-i", mp3,
                "-ar", str(SR), "-ac", "1", wav)

            spoken = duration(wav)
            # Leave a beat of air at the end of the window.
            budget = max(0.5, window - 0.25)
            if spoken > budget:
                # atempo only accepts 0.5-2.0 per stage; chain if ever needed.
                tempo = min(2.0, spoken / budget)
                fitted = os.path.join(work, f"s{i}f.wav")
                run("ffmpeg", "-y", "-loglevel", "error", "-i", wav,
                    "-filter:a", f"atempo={tempo:.4f}", fitted)
                wav = fitted
                spoken = duration(wav)
                stretched += 1

            pieces.append((start, wav, spoken))
            print(f"  seg {i:2d}  start {start:6.2f}s  window {window:5.2f}s  spoken {spoken:5.2f}s")

        # Lay every line at its exact original offset.
        inputs = []
        filters = []
        for idx, (start, wav, _) in enumerate(pieces):
            inputs += ["-i", wav]
            filters.append(f"[{idx}:a]adelay={int(start * 1000)}|{int(start * 1000)}[a{idx}]")
        mix = "".join(f"[a{i}]" for i in range(len(pieces)))
        total = duration(VIDEO)
        graph = ";".join(filters) + f";{mix}amix=inputs={len(pieces)}:normalize=0[out]"

        run("ffmpeg", "-y", "-loglevel", "error", *inputs,
            "-filter_complex", graph, "-map", "[out]",
            "-t", f"{total}", "-b:a", "192k", AUDIO_OUT)

        # Mux onto the footage. Video is copied untouched.
        run("ffmpeg", "-y", "-loglevel", "error",
            "-i", VIDEO, "-i", AUDIO_OUT,
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest", FINAL)

        print(f"\nvoice     : {VOICE}")
        print(f"segments  : {len(segments)} ({stretched} nudged to fit their window)")
        print(f"narration : {duration(AUDIO_OUT):.2f}s")
        print(f"video     : {duration(FINAL):.2f}s")
        print(f"output    : {FINAL}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
