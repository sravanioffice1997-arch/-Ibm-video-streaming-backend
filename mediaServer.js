const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const NodeMediaServer = require("node-media-server");

const config = require("./config");
const store = require("./streamStore");

// Track running ffmpeg transcode processes per stream key so we can kill them
// cleanly when the broadcaster stops streaming.
const activeTranscodes = new Map(); // streamKey -> ChildProcess

const nmsConfig = {
  rtmp: {
    port: config.RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: config.HTTP_MEDIA_PORT,
    mediaroot: config.MEDIA_ROOT,
    allow_origin: "*",
  },
  // We do our own transcoding via FFmpeg (see startAbrTranscode below) so we
  // have full control over the ABR ladder, instead of using NMS's built-in
  // single-rendition "trans" block.
};

const nms = new NodeMediaServer(nmsConfig);

/**
 * Builds an ffmpeg command that takes the single incoming RTMP source and
 * produces the full adaptive-bitrate ladder + a master HLS manifest,
 * mirroring the "Cloud Transcoding Service" step described in the report.
 */
function startAbrTranscode(streamKey) {
  const inputUrl = `rtmp://127.0.0.1:${config.RTMP_PORT}/live/${streamKey}`;
  const outDir = path.join(config.MEDIA_ROOT, "live", streamKey);
  fs.mkdirSync(outDir, { recursive: true });

  const ladder = config.ABR_LADDER;
  const args = ["-i", inputUrl, "-y"];

  // One video+audio output pair per rendition in the ladder.
  ladder.forEach((r, i) => {
    args.push(
      "-map", "0:v:0", "-map", "0:a:0",
      `-s:v:${i}`, `${r.width}x${r.height}`,
      `-c:v:${i}`, "libx264",
      `-b:v:${i}`, r.videoBitrate,
      "-preset", "veryfast",
      "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
      `-c:a:${i}`, "aac",
      `-b:a:${i}`, r.audioBitrate,
      "-ac", "2"
    );
  });

  const varStreamMap = ladder.map((_, i) => `v:${i},a:${i},name:${ladder[i].name}`).join(" ");

  args.push(
    "-f", "hls",
    "-hls_time", String(config.HLS_SEGMENT_SECONDS),
    "-hls_list_size", String(config.HLS_LIST_SIZE),
    "-hls_flags", "delete_segments+independent_segments",
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", varStreamMap,
    path.join(outDir, "%v", "index.m3u8")
  );

  // ffmpeg needs the per-rendition subfolders to exist before it writes into them
  ladder.forEach((r) => fs.mkdirSync(path.join(outDir, r.name), { recursive: true }));

  const ff = spawn(config.FFMPEG_PATH, args);
  ff.stderr.on("data", (d) => {
    // Verbose; keep for debugging, comment out in production
    // console.log(`[ffmpeg ${streamKey}] ${d}`);
  });
  ff.on("close", (code) => {
    console.log(`[ffmpeg] transcode for ${streamKey} exited (code ${code})`);
    activeTranscodes.delete(streamKey);
  });

  activeTranscodes.set(streamKey, ff);
  console.log(`[ffmpeg] started ABR transcode for stream ${streamKey} -> ${outDir}`);
}

function stopAbrTranscode(streamKey) {
  const proc = activeTranscodes.get(streamKey);
  if (proc) {
    proc.kill("SIGINT");
    activeTranscodes.delete(streamKey);
  }
}

// ---- NMS lifecycle hooks: this is where "ingest" meets stream-key auth ----

nms.on("prePublish", (id, StreamPath, args) => {
  // StreamPath looks like /live/<streamKey>
  const streamKey = StreamPath.split("/").pop();
  const channel = store.getByStreamKey(streamKey);

  if (!channel) {
    console.log(`[auth] rejected unknown stream key: ${streamKey}`);
    const session = nms.getSession(id);
    session.reject();
    return;
  }

  console.log(`[auth] accepted publish for channel "${channel.title}" (${channel.channelId})`);
  store.markLive(channel.channelId);
  startAbrTranscode(streamKey);
});

nms.on("donePublish", (id, StreamPath, args) => {
  const streamKey = StreamPath.split("/").pop();
  const channel = store.getByStreamKey(streamKey);
  if (channel) {
    store.markEnded(channel.channelId);
    console.log(`[stream] channel "${channel.title}" went offline`);
  }
  stopAbrTranscode(streamKey);
});

module.exports = { nms };
