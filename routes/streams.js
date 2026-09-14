const express = require("express");
const router = express.Router();
const store = require("../streamStore");
const config = require("../config");

/**
 * POST /api/channels
 * Create a new channel and generate its RTMP stream key + ingest URL.
 * body: { title: string, ownerId: string, isPrivate?: boolean }
 */
router.post("/channels", (req, res) => {
  const { title, ownerId, isPrivate } = req.body;
  if (!title || !ownerId) {
    return res.status(400).json({ error: "title and ownerId are required" });
  }

  const channel = store.createChannel({ title, ownerId, isPrivate: !!isPrivate });

  res.status(201).json({
    channelId: channel.channelId,
    title: channel.title,
    status: channel.status,
    ingest: {
      rtmpUrl: `rtmp://<server-ip>:${config.RTMP_PORT}/live`,
      streamKey: channel.streamKey,
      // Full URL an encoder (OBS, vMix, etc.) would use:
      fullIngestUrl: `rtmp://<server-ip>:${config.RTMP_PORT}/live/${channel.streamKey}`,
    },
  });
});

/**
 * GET /api/channels
 * List all channels with live/offline status (dashboard use).
 */
router.get("/channels", (req, res) => {
  const channels = store.list().map((c) => ({
    channelId: c.channelId,
    title: c.title,
    status: c.status,
    viewerCount: c.viewerCount,
    peakViewers: c.peakViewers,
    startedAt: c.startedAt,
  }));
  res.json(channels);
});

/**
 * GET /api/channels/:id
 * Full channel detail, including playback URLs once live.
 */
router.get("/channels/:id", (req, res) => {
  const channel = store.getById(req.params.id);
  if (!channel) return res.status(404).json({ error: "channel not found" });

  const playback =
    channel.status === "live"
      ? {
          hlsMasterUrl: `http://<server-ip>:${config.HTTP_MEDIA_PORT}/live/${channel.streamKey}/master.m3u8`,
        }
      : null;

  res.json({
    channelId: channel.channelId,
    title: channel.title,
    status: channel.status,
    isPrivate: channel.isPrivate,
    startedAt: channel.startedAt,
    endedAt: channel.endedAt,
    viewerCount: channel.viewerCount,
    peakViewers: channel.peakViewers,
    playback,
  });
});

/**
 * POST /api/channels/:id/regenerate-key
 * Rotate the stream key (e.g. if it leaked).
 */
router.post("/channels/:id/regenerate-key", (req, res) => {
  const channel = store.regenerateStreamKey(req.params.id);
  if (!channel) return res.status(404).json({ error: "channel not found" });
  res.json({ channelId: channel.channelId, streamKey: channel.streamKey });
});

/**
 * POST /api/channels/:id/viewers
 * Update viewer count — in a real system this would be driven by CDN/player
 * heartbeat pings rather than a manual call, but this exposes the same
 * "analytics" data point described in the report.
 * body: { count: number }
 */
router.post("/channels/:id/viewers", (req, res) => {
  const { count } = req.body;
  if (typeof count !== "number" || count < 0) {
    return res.status(400).json({ error: "count must be a non-negative number" });
  }
  const channel = store.setViewerCount(req.params.id, count);
  if (!channel) return res.status(404).json({ error: "channel not found" });
  res.json({ channelId: channel.channelId, viewerCount: channel.viewerCount, peakViewers: channel.peakViewers });
});

module.exports = router;
