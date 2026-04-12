(() => {
  // ── Audio waveform background animation ──
  const canvas = document.getElementById("waveCanvas");
  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = 200;
  }

  function getWaveColor() {
    const theme = document.documentElement.getAttribute("data-theme");
    return theme === "light"
      ? { r: 212, g: 58, b: 0 }
      : { r: 255, g: 77, b: 26 };
  }

  let time = 0;
  function drawWaves() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const c = getWaveColor();

    for (let w = 0; w < 3; w++) {
      ctx.beginPath();
      const alpha = 0.04 - w * 0.01;
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
      ctx.lineWidth = 1.5;

      for (let x = 0; x <= canvas.width; x += 2) {
        const y =
          Math.sin(x * 0.003 + time + w * 0.8) * 25 +
          Math.sin(x * 0.007 + time * 1.3 + w) * 15 +
          Math.sin(x * 0.001 + time * 0.5) * 35 +
          100;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Audio bar visualizer in the center
    const barCount = 48;
    const barWidth = 3;
    const gap = (canvas.width * 0.5) / barCount;
    const startX = canvas.width * 0.25;

    for (let i = 0; i < barCount; i++) {
      const h =
        Math.abs(Math.sin(i * 0.3 + time * 2)) * 30 +
        Math.abs(Math.cos(i * 0.5 + time * 1.5)) * 20 +
        5;
      const x = startX + i * gap;
      const alpha = 0.06 + Math.abs(Math.sin(i * 0.2 + time)) * 0.04;
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
      ctx.fillRect(x, 100 - h / 2, barWidth, h);
    }

    time += 0.008;
    requestAnimationFrame(drawWaves);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  drawWaves();

  // ── Duplicate platform chips for infinite scroll ──
  const track = document.querySelector(".strip-track");
  if (track) {
    const chips = track.innerHTML;
    track.innerHTML = chips + chips;
  }

  // ── Theme toggle ──
  const themeToggle = document.getElementById("themeToggle");
  const saved = localStorage.getItem("vs-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);

  themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("vs-theme", next);
  });

  // ── DOM refs ──
  const urlInput = document.getElementById("urlInput");
  const fetchBtn = document.getElementById("fetchBtn");
  const btnText = fetchBtn.querySelector(".btn-text");
  const btnSpinner = fetchBtn.querySelector(".btn-spinner");
  const btnArrow = fetchBtn.querySelector(".btn-arrow");
  const platformBadge = document.getElementById("platformBadge");
  const platformIcon = document.getElementById("platformIcon");
  const platformName = document.getElementById("platformName");
  const errorMsg = document.getElementById("errorMsg");
  const modalOverlay = document.getElementById("modalOverlay");
  const modalClose = document.getElementById("modalClose");
  const thumbImg = document.getElementById("thumbImg");
  const durationBadge = document.getElementById("durationBadge");
  const videoTitle = document.getElementById("videoTitle");
  const uploader = document.getElementById("uploader");
  const views = document.getElementById("views");
  const videoFormats = document.getElementById("videoFormats");
  const audioFormats = document.getElementById("audioFormats");
  const toast = document.getElementById("toast");

  // ── Platform detection ──
  const platforms = [
    { name: "YouTube", icon: "▶", patterns: [/youtube\.com/, /youtu\.be/] },
    { name: "Instagram", icon: "📷", patterns: [/instagram\.com/] },
    { name: "TikTok", icon: "♪", patterns: [/tiktok\.com/] },
    { name: "Facebook", icon: "f", patterns: [/facebook\.com/, /fb\.watch/] },
    { name: "Twitter/X", icon: "𝕏", patterns: [/twitter\.com/, /x\.com/] },
    { name: "Vimeo", icon: "▷", patterns: [/vimeo\.com/] },
    { name: "Dailymotion", icon: "D", patterns: [/dailymotion\.com/] },
    { name: "SoundCloud", icon: "☁", patterns: [/soundcloud\.com/] },
    { name: "Reddit", icon: "⬡", patterns: [/reddit\.com/, /redd\.it/] },
    { name: "Twitch", icon: "◆", patterns: [/twitch\.tv/] },
    { name: "Bilibili", icon: "B", patterns: [/bilibili\.com/, /b23\.tv/] },
    { name: "Pinterest", icon: "P", patterns: [/pinterest\./] },
  ];

  function detectPlatform(url) {
    for (const p of platforms) {
      for (const re of p.patterns) {
        if (re.test(url)) return p;
      }
    }
    return null;
  }

  function isValidUrl(s) {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  urlInput.addEventListener("input", () => {
    const val = urlInput.value.trim();
    const valid = isValidUrl(val);
    fetchBtn.disabled = !valid;

    const p = detectPlatform(val);
    if (p) {
      platformIcon.textContent = p.icon;
      platformName.textContent = p.name;
      platformBadge.classList.add("visible");
    } else {
      platformBadge.classList.remove("visible");
    }
    errorMsg.classList.add("hidden");
  });

  // ── Helpers ──
  function fmtDuration(sec) {
    if (!sec) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function fmtViews(n) {
    if (!n) return "";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
    return `${n} views`;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 2800);
  }

  function setLoading(on) {
    fetchBtn.disabled = on;
    btnText.classList.toggle("hidden", on);
    btnArrow.classList.toggle("hidden", on);
    btnSpinner.classList.toggle("hidden", !on);
  }

  // ── Fetch ──
  fetchBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    errorMsg.classList.add("hidden");
    setLoading(true);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      showModal(data, url);
    } catch (err) {
      errorMsg.textContent = err.message;
      errorMsg.classList.remove("hidden");
    } finally {
      setLoading(false);
    }
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !fetchBtn.disabled) fetchBtn.click();
  });

  // ── Modal ──
  function showModal(data, url) {
    thumbImg.src = data.thumbnail || "";
    durationBadge.textContent = fmtDuration(data.duration);
    videoTitle.textContent = data.title || "Untitled";
    uploader.textContent = data.uploader || "Unknown";
    views.textContent = fmtViews(data.view_count);

    const resolutions = [
      { label: "4K", quality: "2160p", height: 2160 },
      { label: "2K", quality: "1440p", height: 1440 },
      { label: "1080p", quality: "1080p", height: 1080 },
      { label: "720p", quality: "720p", height: 720 },
      { label: "480p", quality: "480p", height: 480 },
      { label: "360p", quality: "360p", height: 360 },
    ];

    videoFormats.innerHTML = "";
    for (const r of resolutions) {
      const available = data.availableResolutions.includes(r.height);
      const btn = document.createElement("button");
      btn.className = `dl-btn${available ? "" : " unavailable"}`;
      btn.textContent = r.label;
      if (available) btn.addEventListener("click", () => startDownload(url, "mp4", r.quality));
      videoFormats.appendChild(btn);
    }

    const audioOptions = [
      { label: "MP3 320k", type: "mp3", quality: "320" },
      { label: "MP3 192k", type: "mp3", quality: "192" },
      { label: "M4A", type: "m4a", quality: "" },
    ];

    audioFormats.innerHTML = "";
    for (const a of audioOptions) {
      const btn = document.createElement("button");
      btn.className = "dl-btn audio-btn";
      if (!data.hasAudio) btn.classList.add("unavailable");
      btn.textContent = a.label;
      if (data.hasAudio) btn.addEventListener("click", () => startDownload(url, a.type, a.quality));
      audioFormats.appendChild(btn);
    }

    modalOverlay.classList.remove("hidden");
  }

  modalClose.addEventListener("click", () => modalOverlay.classList.add("hidden"));
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modalOverlay.classList.add("hidden");
  });

  function startDownload(url, type, quality) {
    const params = new URLSearchParams({ url, type, quality });
    const a = document.createElement("a");
    a.href = `/api/download?${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`Downloading ${type.toUpperCase()}${quality ? " " + quality : ""}…`);
  }
})();
