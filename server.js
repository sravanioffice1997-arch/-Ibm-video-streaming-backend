const express = require("express");
const cors = require("cors");
const path = require("path");

const config = require("./config");
const streamsRouter = require("./routes/streams");
const { nms } = require("./mediaServer"); // starts RTMP/HLS media server on require

const app = express();

app.use(cors());
app.use(express.json());

// Serve the HLS/DASH output directly (in production this would sit behind a
// real CDN instead of Express, per the multi-CDN step in the report).
app.use("/media", express.static(config.MEDIA_ROOT));

// Simple browser test player (HTML + hls.js) for manual QA.
app.use("/", express.static(path.join(__dirname, "public")));

app.use("/api", streamsRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.listen(config.API_PORT, () => {
  console.log(`REST API listening on http://localhost:${config.API_PORT}`);
});

// Boots RTMP (ingest) + HTTP (HLS delivery) servers from node-media-server.
nms.run();
console.log(`RTMP ingest listening on rtmp://localhost:${config.RTMP_PORT}/live`);
console.log(`HLS media server listening on http://localhost:${config.HTTP_MEDIA_PORT}`);
