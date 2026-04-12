# VideoSnap

Universal video & audio downloader web app powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp). No accounts, no API keys, no paid services.

## Supported Platforms

| Platform | Status |
|----------|--------|
| YouTube | ✅ |
| Instagram | ✅ |
| TikTok | ✅ |
| Facebook | ✅ |
| Twitter / X | ✅ |
| Vimeo | ✅ |
| Dailymotion | ✅ |
| SoundCloud | ✅ |
| Reddit | ✅ |
| Twitch | ✅ |
| Bilibili | ✅ |
| Pinterest | ✅ |
| **+ 1000 more** | ✅ via yt-dlp |

## Prerequisites

- **Node.js** >= 18
- **yt-dlp** — the download engine
- **ffmpeg** — required for audio conversion and video merging

### Install dependencies

**macOS** (Homebrew):
```bash
brew install yt-dlp ffmpeg
```

**Linux** (Ubuntu/Debian):
```bash
sudo apt update && sudo apt install ffmpeg
pip install yt-dlp
```

**Windows** (Scoop):
```bash
scoop install yt-dlp ffmpeg
```

Or download binaries from:
- yt-dlp: https://github.com/yt-dlp/yt-dlp/releases
- ffmpeg: https://ffmpeg.org/download.html

## Setup

```bash
cd backend
npm install
npm start
```

Open http://localhost:3000 in your browser.

For development with auto-reload:
```bash
npm run dev
```

## API

### `GET /api/health`

Returns server status, yt-dlp version, and ffmpeg availability.

### `POST /api/info`

**Body:** `{ "url": "https://..." }`

Returns video metadata: title, uploader, duration, thumbnail, view count, and available resolutions.

### `GET /api/download`

**Query params:**
- `url` — the video/audio URL
- `type` — `mp4`, `mp3`, or `m4a`
- `quality` — `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` (video) or `320`, `192` (mp3 bitrate)

Streams the file directly to the browser.

## Project Structure

```
videosnap/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/
│   ├── server.js
│   └── package.json
├── .gitignore
└── README.md
```

## Deployment

Set the `PORT` environment variable to configure the listening port (default: 3000).

```bash
PORT=8080 npm start
```

Ensure `yt-dlp` and `ffmpeg` are available in the server's `$PATH`.

## Legal Notice

This tool is for personal use only. Downloading copyrighted content without permission may violate the terms of service of the respective platforms and applicable copyright laws. Users are responsible for ensuring their use complies with all applicable laws and platform terms of service.
