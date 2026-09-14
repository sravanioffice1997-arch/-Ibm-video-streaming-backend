# IBM-Style Live Streaming Backend (Node.js + Express)

A minimal backend that reproduces the pipeline described in the report:
**Encoder → RTMP Ingest → FFmpeg ABR Transcode → HLS Packaging → Playback**, with an
Express REST API for channel/stream management (standing in for IBM's
console + stream-key auth).

## Stack
- **Express** — REST API (create channels, list live streams, playback URLs)
- **node-media-server** — RTMP ingest server + HTTP server for serving HLS segments
- **FFmpeg** (spawned via `child_process`) — transcodes the single incoming RTMP
  feed into a multi-rendition ABR ladder (1080p/720p/480p/360p) and packages it
  as HLS, exactly like the "Cloud Transcoding Service" step in the report
- **hls.js** — browser test player

## Prerequisites
- Node.js 18+
- FFmpeg installed and on your PATH (`ffmpeg -version` should work), or set
  `FFMPEG_PATH` in `.env`/environment to its location
- An RTMP encoder to test with, e.g. **OBS Studio** (free)

## Setup
```bash
npm install
npm start
```
This starts:
- REST API on `http://localhost:3000`
- RTMP ingest on `rtmp://localhost:1935/live`
- HLS/DASH HTTP server on `http://localhost:8000`

## Usage flow

1. **Create a channel** (this generates a stream key, like IBM Video Streaming does):
   ```bash
   curl -X POST http://localhost:3000/api/channels \
     -H "Content-Type: application/json" \
     -d '{"title":"My Live Show","ownerId":"user1"}'
   ```
   Response includes `ingest.fullIngestUrl`, e.g.
   `rtmp://localhost:1935/live/<streamKey>`.

2. **Start broadcasting** — in OBS: Settings → Stream → Server:
   `rtmp://localhost:1935/live`, Stream Key: `<streamKey>` from step 1.
   Click "Start Streaming".

   On the server side this triggers `prePublish` in `mediaServer.js`, which
   validates the key against the channel store and spawns the FFmpeg ABR
   transcode job.

3. **Check status / get the playback URL**:
   ```bash
   curl http://localhost:3000/api/channels/<channelId>
   ```
   Once live, this returns `playback.hlsMasterUrl`, e.g.
   `http://localhost:8000/live/<streamKey>/master.m3u8`.

4. **Watch it** — open `http://localhost:3000/` in a browser (the bundled
   test player), paste the `hlsMasterUrl`, and click "Load Stream". The
   player (hls.js) automatically performs adaptive bitrate switching between
   the renditions FFmpeg generated.

5. **Stop broadcasting** in OBS — `donePublish` fires, the channel is marked
   `ended`, and the FFmpeg process is killed.

## Where each report concept lives in the code

| Report concept              | File / mechanism |
|---|---|
| RTMP ingest + stream-key auth | `mediaServer.js` → `prePublish` hook |
| Cloud transcoding / ABR ladder | `mediaServer.js` → `startAbrTranscode()`, ladder defined in `config.js` |
| HLS packaging (manifest + segments) | ffmpeg `-f hls` args in `startAbrTranscode()` |
| Multi-CDN delivery | `/media` static route in `server.js` (swap for a real CDN origin-pull in production) |
| Channel/stream-key management | `streamStore.js`, `routes/streams.js` |
| Analytics (viewer count) | `POST /api/channels/:id/viewers`, `streamStore.js` |
| Client-side ABR playback | `public/index.html` (hls.js) |

## Notes / production considerations
- `streamStore.js` is in-memory — swap for Postgres/Mongo/Redis in production.
- Real viewer counts should come from CDN/player heartbeat telemetry, not a
  manual API call.
- Add HTTPS/RTMPS termination and a proper auth layer (JWT, OAuth) in front
  of the management API before exposing this beyond localhost.
- IBM Watson's speech-to-text captioning would plug in as an additional
  consumer of the RTMP/HLS audio track — not included here, but the
  `donePublish`/`prePublish` hooks are the natural place to kick that off.
