const { v4: uuidv4 } = require("uuid");

/**
 * In-memory data store standing in for a real database (e.g. Postgres/Mongo).
 * Tracks channels (broadcasters) and their live/VOD state, similar to how
 * IBM Video Streaming ties a "stream key" to a channel + access rules.
 */
class StreamStore {
  constructor() {
    this.channels = new Map(); // channelId -> channel object
  }

  createChannel({ title, ownerId, isPrivate = false }) {
    const channelId = uuidv4();
    const streamKey = uuidv4().replace(/-/g, "");
    const channel = {
      channelId,
      title,
      ownerId,
      isPrivate,
      streamKey,
      status: "offline", // offline | live | ended
      startedAt: null,
      endedAt: null,
      viewerCount: 0,
      peakViewers: 0,
      captionsEnabled: true,
      recordings: [], // completed VOD segments/files
    };
    this.channels.set(channelId, channel);
    return channel;
  }

  list() {
    return Array.from(this.channels.values());
  }

  getById(channelId) {
    return this.channels.get(channelId);
  }

  getByStreamKey(streamKey) {
    return this.list().find((c) => c.streamKey === streamKey);
  }

  markLive(channelId) {
    const c = this.getById(channelId);
    if (!c) return null;
    c.status = "live";
    c.startedAt = new Date().toISOString();
    c.endedAt = null;
    return c;
  }

  markEnded(channelId) {
    const c = this.getById(channelId);
    if (!c) return null;
    c.status = "ended";
    c.endedAt = new Date().toISOString();
    c.viewerCount = 0;
    return c;
  }

  setViewerCount(channelId, count) {
    const c = this.getById(channelId);
    if (!c) return null;
    c.viewerCount = count;
    c.peakViewers = Math.max(c.peakViewers, count);
    return c;
  }

  regenerateStreamKey(channelId) {
    const c = this.getById(channelId);
    if (!c) return null;
    c.streamKey = uuidv4().replace(/-/g, "");
    return c;
  }
}

module.exports = new StreamStore();
