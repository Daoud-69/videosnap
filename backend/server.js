const express = require("express");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS — allow frontend on Vercel to call this backend ──
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, mobile apps) or from allowed list
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
  })
);

// ── Security middleware ──

// Helmet: sets secure HTTP headers (XSS protection, no sniffing, no clickjacking, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://*"],  // thumbnails come from external CDNs
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,  // allow loading external thumbnails
  })
);

// Rate limiting — prevent abuse and DDoS
const infoLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 15,                    // 15 info requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute before trying again." },
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,                     // 5 downloads per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many downloads. Please wait a minute before trying again." },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,                   // 200 total requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Please try again later." },
});

app.use(globalLimiter);

// Limit request body size (prevents large payload attacks)
app.use(express.json({ limit: "1kb" }));

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// ── URL validation ──

function isValidUrl(str) {
  if (!str || typeof str !== "string") return false;
  if (str.length > 2048) return false;  // reject absurdly long URLs

  try {
    const u = new URL(str);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    // Block SSRF: reject internal/private network URLs
    const hostname = u.hostname.toLowerCase();
    const blocked = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "[::1]",
      "169.254.169.254",    // AWS/cloud metadata endpoint
      "metadata.google.internal",
    ];
    if (blocked.includes(hostname)) return false;
    if (hostname.endsWith(".local")) return false;
    if (hostname.endsWith(".internal")) return false;
    if (/^10\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

// Whitelist for type and quality params (prevent injection via query strings)
const ALLOWED_TYPES = new Set(["mp4", "mp3", "m4a"]);
const ALLOWED_QUALITIES = new Set(["2160p", "1440p", "1080p", "720p", "480p", "360p", "320", "192", ""]);

// Track active downloads to limit concurrent processes
let activeDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = 3;

// ── Health check ──

app.get("/api/health", (_req, res) => {
  let ytdlpVersion = "not installed";
  let ffmpegInstalled = false;
  try {
    ytdlpVersion = execSync("yt-dlp --version", { encoding: "utf8", timeout: 5000 }).trim();
  } catch {}
  try {
    execSync("ffmpeg -version", { encoding: "utf8", timeout: 5000 });
    ffmpegInstalled = true;
  } catch {}
  res.json({ status: "ok", ytdlpVersion, ffmpegInstalled });
});

// ── YouTube client strategies (tried in order) ──
const YT_CLIENTS = [
  "web_creator",
  "tv",
  "ios",
  "mediaconnect",
  "default",
];

// Detect platform from URL for targeted error messages
function detectPlatform(url) {
  if (/youtu\.?be/.test(url))        return "youtube";
  if (/instagram\.com/.test(url))    return "instagram";
  if (/tiktok\.com/.test(url))       return "tiktok";
  if (/twitter\.com|x\.com/.test(url)) return "twitter";
  if (/reddit\.com|v\.redd\.it/.test(url)) return "reddit";
  if (/facebook\.com|fb\.watch/.test(url)) return "facebook";
  if (/vimeo\.com/.test(url))        return "vimeo";
  if (/soundcloud\.com/.test(url))   return "soundcloud";
  if (/dailymotion\.com/.test(url))  return "dailymotion";
  if (/twitch\.tv/.test(url))        return "twitch";
  if (/bilibili\.com|b23\.tv/.test(url)) return "bilibili";
  if (/pinterest\./i.test(url))      return "pinterest";
  return "unknown";
}

// Platform-specific friendly error messages
const PLATFORM_ERRORS = {
  instagram: "Instagram requires you to be logged in. Open Instagram in your browser, log in, then try again — the downloader will use your session.",
  twitter:   "Twitter/X now requires login to download videos. Log into X in your browser and retry.",
  reddit:    "Reddit video is unavailable — it may be deleted, private, or geo-restricted.",
  bilibili:  "This Bilibili video is geo-restricted and not available in your region.",
  pinterest: "This Pinterest pin doesn't contain a downloadable video, or the pin is unavailable.",
  twitch:    "This Twitch clip or VOD has expired or is subscriber-only.",
};

// Run yt-dlp with a specific client, returns a promise
function runYtdlp(url, clientIdx = 0, useCookies = false) {
  return new Promise((resolve, reject) => {
    const client = YT_CLIENTS[clientIdx] || "default";
    const platform = detectPlatform(url);
    const isYouTube = platform === "youtube";

    const args = [
      "--dump-json",
      "--no-warnings",
      "--no-playlist",
      "--no-exec",
      "--no-batch-file",
      "--socket-timeout", "15",
    ];

    if (isYouTube) {
      args.push("--extractor-args", `youtube:player_client=${client}`);
    }

    // Use browser cookies for platforms that need auth
    if (useCookies) {
      args.push("--cookies-from-browser", "chrome");
    }

    args.push(url);

    const proc = spawn("yt-dlp", args, {
      timeout: 30000,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let stdout = "";
    let stderr = "";
    let stdoutSize = 0;
    const MAX_OUTPUT = 5 * 1024 * 1024;

    proc.stdout.on("data", (chunk) => {
      stdoutSize += chunk.length;
      if (stdoutSize > MAX_OUTPUT) { proc.kill(); return; }
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    const timer = setTimeout(() => { proc.kill(); }, 25000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const msg = stderr.toLowerCase();
        const isAgeOrBot = msg.includes("age") || msg.includes("sign in") || msg.includes("bot") || msg.includes("confirm");
        const needsAuth = msg.includes("login") || msg.includes("cookie") || msg.includes("csrf")
                       || msg.includes("empty media") || msg.includes("404")
                       || msg.includes("no video could be found");

        // YouTube: retry with next client
        if (isYouTube && isAgeOrBot && clientIdx + 1 < YT_CLIENTS.length) {
          return runYtdlp(url, clientIdx + 1, useCookies).then(resolve).catch(reject);
        }

        // Instagram / Twitter: retry with browser cookies on first attempt
        if (!useCookies && needsAuth && (platform === "instagram" || platform === "twitter")) {
          return runYtdlp(url, clientIdx, true).then(resolve).catch(reject);
        }

        reject({ stderr: msg, code, platform });
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject({ error: err });
    });
  });
}

// ── Video info ──

app.post("/api/info", infoLimiter, async (req, res) => {
  const { url } = req.body;
  if (!url || !isValidUrl(url))
    return res.status(400).json({ error: "A valid HTTP(S) URL is required" });

  try {
    const stdout = await runYtdlp(url);
    const code = 0;

    try {
      const data = JSON.parse(stdout);
      const formats = (data.formats || [])
        .filter((f) => f.vcodec !== "none" && f.acodec !== "none" && f.height)
        .map((f) => ({
          height: f.height,
        }));

      const videoOnly = (data.formats || [])
        .filter((f) => f.vcodec !== "none" && f.acodec === "none" && f.height)
        .map((f) => ({ height: f.height }));

      const audioFormats = (data.formats || [])
        .filter((f) => f.vcodec === "none" && f.acodec !== "none");

      const anyVideo = (data.formats || [])
        .filter((f) => f.vcodec !== "none" && f.height)
        .map((f) => f.height);

      const allVideoHeights = new Set();
      formats.forEach((f) => allVideoHeights.add(f.height));
      videoOnly.forEach((f) => allVideoHeights.add(f.height));
      anyVideo.forEach((h) => allVideoHeights.add(h));

      const allFormats = data.formats || [];
      const hasGenericFormats = allFormats.some(
        (f) => f.format_id && !f.height && f.vcodec === "none" && f.ext === "mp4"
      );

      let availableResolutions;
      if (allVideoHeights.size > 0) {
        availableResolutions = [2160, 1440, 1080, 720, 480, 360].filter((h) => {
          for (const height of allVideoHeights) {
            if (height >= h) return true;
          }
          return false;
        });
      } else if (hasGenericFormats || allFormats.length > 0) {
        availableResolutions = [1080, 720, 480, 360];
      } else {
        availableResolutions = [];
      }

      // Only send safe fields — never send raw format data or internal URLs
      res.json({
        title: String(data.title || "Untitled").slice(0, 200),
        uploader: String(data.uploader || data.channel || "Unknown").slice(0, 100),
        duration: typeof data.duration === "number" ? data.duration : null,
        thumbnail: data.thumbnail || null,
        view_count: typeof data.view_count === "number" ? data.view_count : null,
        availableResolutions,
        hasAudio: audioFormats.length > 0 || formats.length > 0 || allFormats.length > 0,
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to parse video info" });
    }
  } catch (err) {
    if (res.headersSent) return;
    const msg  = err.stderr || "";
    const plat = err.platform || detectPlatform(url);

    // Platform-specific known errors
    if (PLATFORM_ERRORS[plat]) {
      return res.status(403).json({ error: PLATFORM_ERRORS[plat] });
    }
    if (msg.includes("private") || msg.includes("members only"))
      return res.status(403).json({ error: "This video is private or members-only." });
    if (msg.includes("geo") || msg.includes("not available in your country") || msg.includes("geo-restricted"))
      return res.status(403).json({ error: "This video is geo-restricted and not available in your region." });
    if (msg.includes("age") || msg.includes("sign in") || msg.includes("confirm your age"))
      return res.status(403).json({ error: "This video requires age verification or login." });
    if (msg.includes("unsupported url") || msg.includes("no video could be found") || msg.includes("no suitable"))
      return res.status(400).json({ error: "No downloadable video found at this URL." });
    if (msg.includes("404") || msg.includes("not found"))
      return res.status(404).json({ error: "Video not found — it may have been deleted or the URL is wrong." });
    if (err.error && err.error.code === "ENOENT")
      return res.status(500).json({ error: "yt-dlp is not installed on the server." });
    return res.status(500).json({ error: "Could not fetch video info. The video may be private, deleted, or region-locked." });
  }
});

// ── Download ──

app.get("/api/download", downloadLimiter, (req, res) => {
  const { url, type, quality } = req.query;

  // Validate all inputs strictly
  if (!url || !isValidUrl(url))
    return res.status(400).json({ error: "A valid HTTP(S) URL is required" });
  if (!type || !ALLOWED_TYPES.has(type))
    return res.status(400).json({ error: "Invalid type. Allowed: mp4, mp3, m4a" });
  if (!ALLOWED_QUALITIES.has(quality || ""))
    return res.status(400).json({ error: "Invalid quality value" });

  // Limit concurrent downloads
  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
    return res.status(503).json({ error: "Server is busy. Please try again in a moment." });
  }
  activeDownloads++;

  const cleanup = () => { activeDownloads = Math.max(0, activeDownloads - 1); };

  if (type === "mp3") {
    const ytArgs = [
      "--no-warnings", "--no-playlist", "--no-exec", "--no-batch-file",
      "--socket-timeout", "15",
      "--extractor-args", "youtube:player_client=web_creator,tv,ios",
      "-f", "bestaudio",
      "-o", "-",
      url,
    ];
    const bitrate = quality === "192" ? "192k" : "320k";

    const ytProc = spawn("yt-dlp", ytArgs);
    const ffProc = spawn("ffmpeg", [
      "-i", "pipe:0", "-vn", "-ab", bitrate, "-f", "mp3", "pipe:1",
    ]);

    ytProc.stdout.pipe(ffProc.stdin);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');

    ffProc.stdout.pipe(res);

    ytProc.stderr.on("data", () => {});
    ffProc.stderr.on("data", () => {});

    ytProc.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ error: "Download failed" });
    });
    ffProc.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ error: "Audio conversion failed" });
    });
    ffProc.on("close", () => {
      cleanup();
      if (!res.writableEnded) res.end();
    });

    // Kill on timeout (10 min max)
    const dlTimeout = setTimeout(() => {
      ytProc.kill(); ffProc.kill();
    }, 600000);
    res.on("close", () => { clearTimeout(dlTimeout); ytProc.kill(); ffProc.kill(); });
    return;
  }

  if (type === "m4a") {
    const ytArgs = [
      "--no-warnings", "--no-playlist", "--no-exec", "--no-batch-file",
      "--socket-timeout", "15",
      "--extractor-args", "youtube:player_client=web_creator,tv,ios",
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "-o", "-",
      url,
    ];
    const ytProc = spawn("yt-dlp", ytArgs);

    res.setHeader("Content-Type", "audio/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="audio.m4a"');

    ytProc.stdout.pipe(res);
    ytProc.stderr.on("data", () => {});
    ytProc.on("error", () => {
      if (!res.headersSent) res.status(500).json({ error: "Download failed" });
    });
    ytProc.on("close", () => {
      cleanup();
      if (!res.writableEnded) res.end();
    });

    const dlTimeout = setTimeout(() => { ytProc.kill(); }, 600000);
    res.on("close", () => { clearTimeout(dlTimeout); ytProc.kill(); });
    return;
  }

  // Video download (mp4)
  const heightMap = {
    "2160p": 2160, "1440p": 1440, "1080p": 1080,
    "720p": 720, "480p": 480, "360p": 360,
  };
  const height = heightMap[quality] || 1080;
  const tmpId = crypto.randomBytes(16).toString("hex");
  const tmpFile = path.join(os.tmpdir(), `videosnap-${tmpId}.mp4`);

  const formatStr = `bestvideo[height<=${height}][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=${height}][vcodec^=avc1]+bestaudio/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
  const args = [
    "--no-warnings", "--no-playlist", "--no-exec", "--no-batch-file",
    "--socket-timeout", "15",
    "--extractor-args", "youtube:player_client=mediaconnect",
    "-f", formatStr,
    "--merge-output-format", "mp4",
    "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart",
    "-o", tmpFile,
    url,
  ];

  const proc = spawn("yt-dlp", args);

  let stderr = "";
  proc.stderr.on("data", (d) => {
    stderr += d;
    // Cap stderr collection
    if (stderr.length > 10000) stderr = stderr.slice(-5000);
  });

  proc.on("error", (err) => {
    cleanup();
    fs.unlink(tmpFile, () => {});
    if (!res.headersSent) res.status(500).json({ error: "Download failed" });
  });

  // Kill on timeout (10 min max for large videos)
  const dlTimeout = setTimeout(() => {
    proc.kill();
    fs.unlink(tmpFile, () => {});
    cleanup();
    if (!res.headersSent) res.status(504).json({ error: "Download timed out" });
  }, 600000);

  proc.on("close", (code) => {
    clearTimeout(dlTimeout);

    if (code !== 0) {
      cleanup();
      fs.unlink(tmpFile, () => {});
      if (!res.headersSent) {
        return res.status(500).json({ error: "Download failed. The video may be unavailable." });
      }
      return;
    }

    try {
      const stat = fs.statSync(tmpFile);

      // Reject files over 2GB (safety limit)
      if (stat.size > 2 * 1024 * 1024 * 1024) {
        fs.unlink(tmpFile, () => {});
        cleanup();
        return res.status(413).json({ error: "File too large" });
      }

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="video.mp4"');
      res.setHeader("Content-Length", stat.size);

      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on("end", () => { fs.unlink(tmpFile, () => {}); cleanup(); });
      stream.on("error", () => {
        fs.unlink(tmpFile, () => {});
        cleanup();
        if (!res.writableEnded) res.end();
      });
    } catch {
      cleanup();
      fs.unlink(tmpFile, () => {});
      if (!res.headersSent) res.status(500).json({ error: "Download failed" });
    }
  });

  // Clean up if client disconnects mid-download
  req.on("close", () => {
    clearTimeout(dlTimeout);
    proc.kill();
    fs.unlink(tmpFile, () => {});
  });
});

// SPA fallback — only serve index.html, nothing else
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => {
  console.log(`VideoSnap running at http://localhost:${PORT}`);
});
