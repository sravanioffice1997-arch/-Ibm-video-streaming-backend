const path = require("path");

module.exports = {
  // Port for the Express REST API (stream management, auth, playback URLs)
  API_PORT: process.env.API_PORT || 3000,

  // Node-Media-Server ports
  RTMP_PORT: process.env.RTMP_PORT || 1935, // encoders (OBS, vMix, etc.) push here
  HTTP_MEDIA_PORT: process.env.HTTP_MEDIA_PORT || 8000, // HLS/DASH segments served here

  // Where transcoded HLS/DASH files land on disk
  MEDIA_ROOT: path.join(__dirname, "media"),

  // FFmpeg binary. Defaults to "ffmpeg" so it's resolved via the system PATH
  // on any OS (Windows/Mac/Linux). Override with the FFMPEG_PATH env var if
  // you need to point at a specific binary location.
  FFMPEG_PATH: process.env.FFMPEG_PATH || "ffmpeg",

  // Adaptive bitrate ladder: each rendition transcoded from the single incoming source stream.
  // Mirrors the "Cloud Transcoding Service" step in the report (source -> multiple renditions).
  ABR_LADDER: [
    { name: "1080p", width: 1920, height: 1080, videoBitrate: "4500k", audioBitrate: "192k" },
    { name: "720p", width: 1280, height: 720, videoBitrate: "2500k", audioBitrate: "128k" },
    { name: "480p", width: 854, height: 480, videoBitrate: "1200k", audioBitrate: "128k" },
    { name: "360p", width: 640, height: 360, videoBitrate: "700k", audioBitrate: "96k" },
  ],

  // HLS segmenting behaviour
  HLS_SEGMENT_SECONDS: 4,
  HLS_LIST_SIZE: 6,
};