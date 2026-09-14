# IBM-Style Live Streaming Backend (Node.js + Express)

**Author:** Sravani Pathipaka
**Role:** AI/ML Intern, Twinn.live

A working backend that reproduces a live-video pipeline modeled on IBM Video
Streaming's architecture:

**Encoder → RTMP Ingest → FFmpeg ABR Transcode → HLS Packaging → Playback**

Built with **Express** (REST API) and **node-media-server** (RTMP ingest +
HLS delivery), with **FFmpeg** doing adaptive-bitrate transcoding. Includes a
browser test player so you can go from "OBS is streaming" to "I can watch it
in a browser" end to end.

## Architecture

| Stage | Technology | What it does |
|---|---|---|
| Capture & encode | OBS Studio (or any RTMP encoder) | Compresses camera/mic into H.264/AAC |
| Ingest | `node-media-server` (RTMP) | Accepts the incoming stream, authenticates it against a stream key |
| Transcode | FFmpeg (spawned per-stream) | Converts the single source into a 1080p/720p/480p/360p ABR ladder |
| Package | FFmpeg `-f hls` | Segments each rendition and writes an HLS manifest |
| Deliver | Express static route | Serves HLS segments (swap for a real CDN in production) |
| Manage | Express REST API | Create channels, issue stream keys, track live status & viewer counts |
| Play | `hls.js` in a browser | Adaptive playback, auto-switches rendition based on bandwidth |

## Prerequisites

- **Node.js 18+** — check with `node -v`
- **FFmpeg** on your system PATH — check with `ffmpeg -version`
- **OBS Studio** (or another RTMP encoder) for testing — [obsproject.com](https://obsproject.com)

## Setup

```bash
git clone <this-repo-url>
cd ibm-stream-backend
npm install
npm start
```

You should see:
```
REST API listening on http://localhost:3000
RTMP ingest listening on rtmp://localhost:1935/live
HLS media server listening on http://localhost:8000
```

## Usage

### 1. Create a channel
```bash
curl -X POST http://localhost:3000/api/channels \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"My Live Show\",\"ownerId\":\"user1\"}"
```
Response includes `ingest.streamKey` and `ingest.fullIngestUrl`.

### 2. Stream from OBS
Settings → Stream → Service: **Custom** → Server: `rtmp://localhost:1935/live`
→ Stream Key: the key from step 1 → **Start Streaming**.

### 3. Check status
```bash
curl http://localhost:3000/api/channels/<channelId>
```
Once live, the response includes `playback.hlsMasterUrl`
(`http://localhost:8000/live/<streamKey>/master.m3u8`).

### 4. Watch it
Open `http://localhost:3000` in a browser, paste the `hlsMasterUrl` into the
test player, click **Load Stream**.

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/channels` | Create a channel, returns a stream key |
| `GET` | `/api/channels` | List all channels with live/offline status |
| `GET` | `/api/channels/:id` | Full channel detail + playback URL if live |
| `POST` | `/api/channels/:id/regenerate-key` | Rotate a channel's stream key |
| `POST` | `/api/channels/:id/viewers` | Update viewer count `{ "count": number }` |
| `GET` | `/api/health` | Health check |

## Project structure
```
├── server.js          # Express app entry point
├── mediaServer.js      # RTMP ingest, stream-key auth, FFmpeg ABR transcoding
├── config.js            # Ports, media paths, ABR ladder definition
├── streamStore.js       # In-memory channel/stream-key store
├── routes/
│   └── streams.js       # REST API route handlers
└── public/
    └── index.html        # hls.js browser test player
```

## Troubleshooting (Windows)

These came up during real setup on Windows + VS Code — included here in case
they help you too.

**`npm : running scripts is disabled on this system`**
PowerShell blocks script execution by default. Either run:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
or switch VS Code's terminal to **Command Prompt** instead of PowerShell.

**`ffmpeg` not recognized**
FFmpeg isn't installed or isn't on PATH. Download a build from
[gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/), extract it so
`ffmpeg.exe` sits at e.g. `C:\ffmpeg\bin\ffmpeg.exe`, then add `C:\ffmpeg\bin`
to your PATH via *Edit environment variables for your account*. Restart your
terminal/VS Code afterward.

**`EADDRINUSE: address already in use :::3000` (or `:1935` / `:8000`)**
A previous run of the server is still alive in the background (closing a
terminal tab doesn't always kill it on Windows). Find and kill it:
```cmd
netstat -ano | findstr :3000
taskkill /PID <the_pid_you_found> /F
```
Repeat for ports 1935 and 8000 if needed. Prefer stopping the server with
**Ctrl+C** in its terminal instead of closing the tab, to avoid this.

**OBS: "Error encoding with encoder 'simple_video_stream'"**
This is local to OBS, not the server. Check Settings → Video for a standard
resolution (e.g. 1920x1080), and Settings → Output for a reasonable bitrate
with the **x264** software encoder. Restart OBS after changing.

**Player shows "Cannot GET .../master.m3u8"**
The FFmpeg transcode process failed to start — check the server terminal for
`[ffmpeg]` log lines. A common cause is `FFMPEG_PATH` in `config.js` pointing
to the wrong binary path for your OS; on Windows it should just be
`"ffmpeg"` so Node resolves it via your system PATH.

## Notes / production considerations
- `streamStore.js` is in-memory — swap for a real database (see `schema.sql`
  if included in this repo) before deploying anywhere persistent.
- Real viewer counts should come from CDN/player heartbeat telemetry, not a
  manual API call.
- Add HTTPS/RTMPS and proper auth (JWT/OAuth) in front of the management API
  before exposing this beyond localhost.
- Captioning/transcript search (the Watson-equivalent piece in the original
  IBM architecture) isn't implemented here, but `prePublish`/`donePublish` in
  `mediaServer.js` are the natural hook points to add it.

## License
MIT (or your preferred license — update this section before publishing).
