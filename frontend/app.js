(() => {
  "use strict";

  // ── API base ──
  const API_BASE = window.VIDEOSNAP_API || "";

  // ────────────────────────────────────────
  // THREE.JS  3D Background  (enhanced)
  // ────────────────────────────────────────
  (function initThree() {
    if (typeof THREE === "undefined") return;

    const canvas = document.getElementById("bgCanvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(0, 0, 28);

    // ── Wireframe geometries ──
    const meshes = [];
    const shapeData = [
      { geo: new THREE.IcosahedronGeometry(3.2, 0),  pos: [-14, 7,  -4], opac: 0.32 },
      { geo: new THREE.OctahedronGeometry(2.8, 0),   pos: [ 15, -5, -6], opac: 0.28 },
      { geo: new THREE.TetrahedronGeometry(2.6, 0),  pos: [-9, -10, -2], opac: 0.24 },
      { geo: new THREE.IcosahedronGeometry(2.0, 0),  pos: [ 16, 9,  -8], opac: 0.20 },
      { geo: new THREE.OctahedronGeometry(1.8, 0),   pos: [-16, 0, -12], opac: 0.18 },
      { geo: new THREE.IcosahedronGeometry(1.4, 0),  pos: [ 8, 12,  -5], opac: 0.22 },
      { geo: new THREE.TorusGeometry(2.2, 0.06, 6, 30), pos: [0, -12, -3], opac: 0.18 },
      { geo: new THREE.TorusGeometry(3.5, 0.05, 5, 40), pos: [-5,  4, -15], opac: 0.10 },
    ];

    shapeData.forEach(({ geo, pos, opac }) => {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff4d1a,
        wireframe: true,
        transparent: true,
        opacity: opac,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      mesh.userData.rotSpeed = {
        x: (Math.random() - 0.5) * 0.005,
        y: (Math.random() - 0.5) * 0.008,
        z: (Math.random() - 0.5) * 0.004,
      };
      mesh.userData.floatOffset = Math.random() * Math.PI * 2;
      mesh.userData.baseY = pos[1];
      scene.add(mesh);
      meshes.push(mesh);
    });

    // ── Large grid plane in the distance ──
    const gridHelper = new THREE.GridHelper(80, 20, 0xff4d1a, 0xff4d1a);
    gridHelper.position.y = -16;
    gridHelper.position.z = -20;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.06;
    scene.add(gridHelper);

    // ── Particles ──
    const particleCount = 280;
    const pGeo = new THREE.BufferGeometry();
    const pPositions = new Float32Array(particleCount * 3);
    const pSizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3]     = (Math.random() - 0.5) * 100;
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 80;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 50 - 10;
      pSizes[i] = Math.random() * 0.15 + 0.05;
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xff4d1a,
      size: 0.18,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ── Mouse parallax ──
    let mouse = { x: 0, y: 0 };
    window.addEventListener("mousemove", (e) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    });

    let t = 0;
    function animate() {
      requestAnimationFrame(animate);
      t += 0.008;

      meshes.forEach((m) => {
        m.rotation.x += m.userData.rotSpeed.x;
        m.rotation.y += m.userData.rotSpeed.y;
        m.rotation.z += m.userData.rotSpeed.z;
        m.position.y = m.userData.baseY + Math.sin(t + m.userData.floatOffset) * 1.2;
      });

      particles.rotation.y += 0.0006;
      particles.rotation.x += 0.0003;

      // Dramatic camera parallax
      camera.position.x += (mouse.x * 3.5 - camera.position.x) * 0.04;
      camera.position.y += (mouse.y * 2   - camera.position.y) * 0.04;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Theme color update
    const themeObserver = new MutationObserver(() => {
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const col = isLight ? 0x7c3aed : 0xff4d1a;
      meshes.forEach((m) => { m.material.color.setHex(col); });
      pMat.color.setHex(col);
      gridHelper.material.color.setHex(col);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  })();

  // ────────────────────────────────────────
  // CUSTOM CURSOR
  // ────────────────────────────────────────
  (function initCursor() {
    const dot  = document.getElementById("cursorDot");
    const ring = document.getElementById("cursorRing");
    if (!dot || !ring) return;
    // Hide on touch devices
    if (window.matchMedia("(pointer: coarse)").matches) {
      dot.style.display = ring.style.display = "none";
      return;
    }

    let dotX = 0, dotY = 0;
    let ringX = 0, ringY = 0;
    let targetX = -200, targetY = -200;

    document.addEventListener("mousemove", (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
    });

    document.addEventListener("mousedown", () => {
      dot.classList.add("is-clicking");
      ring.classList.add("is-clicking");
    });
    document.addEventListener("mouseup", () => {
      dot.classList.remove("is-clicking");
      ring.classList.remove("is-clicking");
    });

    // Hover targets
    const hoverEls = "a, button, .feat-card, .hint, .m-chip, .step-card, input, label";
    document.querySelectorAll(hoverEls).forEach((el) => {
      el.addEventListener("mouseenter", () => {
        dot.classList.add("is-hovering");
        ring.classList.add("is-hovering");
      });
      el.addEventListener("mouseleave", () => {
        dot.classList.remove("is-hovering");
        ring.classList.remove("is-hovering");
      });
    });

    // Animate — dot follows instantly, ring lags
    (function animCursor() {
      requestAnimationFrame(animCursor);
      dotX  += (targetX - dotX)  * 0.5;
      dotY  += (targetY - dotY)  * 0.5;
      ringX += (targetX - ringX) * 0.12;
      ringY += (targetY - ringY) * 0.12;
      dot.style.left  = dotX  + "px";
      dot.style.top   = dotY  + "px";
      ring.style.left = ringX + "px";
      ring.style.top  = ringY + "px";
    })();
  })();

  // ────────────────────────────────────────
  // MAGNETIC BUTTONS
  // ────────────────────────────────────────
  (function initMagnetic() {
    document.querySelectorAll(".fetch-btn, .cta-btn").forEach((btn) => {
      if (window.matchMedia("(pointer: coarse)").matches) return;
      btn.addEventListener("mousemove", (e) => {
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = (e.clientX - cx) * 0.38;
        const dy = (e.clientY - cy) * 0.38;
        btn.style.transform = `translate(${dx}px, ${dy}px)`;
        btn.style.transition = "transform 0.1s ease";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "";
        btn.style.transition = "transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)";
      });
    });
  })();

  // ────────────────────────────────────────
  // GSAP  — using gsap-core, gsap-timeline,
  //          gsap-scrolltrigger skills
  // ────────────────────────────────────────
  (function initGsap() {
    if (typeof gsap === "undefined") return;

    // ── Register plugins ──
    if (typeof ScrollTrigger !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
    }

    // ── Global defaults (gsap-core skill: use defaults) ──
    gsap.defaults({ ease: "power3.out" });

    // ── Responsive + prefers-reduced-motion (gsap-core skill: matchMedia) ──
    const mm = gsap.matchMedia();

    mm.add(
      {
        reduceMotion: "(prefers-reduced-motion: reduce)",
        isDesktop:    "(min-width: 768px)",
      },
      (ctx) => {
        const { reduceMotion, isDesktop } = ctx.conditions;

        // ── Hero entrance timeline (gsap-timeline skill)
        // Uses: timeline defaults, position parameter "<", autoAlpha ──
        const heroTl = gsap.timeline({
          delay: 0.1,
          defaults: {
            duration: reduceMotion ? 0 : 0.65,
            ease: "power3.out",
          },
        });

        // Deco text entrance
        if (!reduceMotion) {
          gsap.from(".hero-deco-text", {
            autoAlpha: 0,
            scale: 1.08,
            duration: 1.8,
            ease: "power2.out",
            delay: 0.05,
          });
        }

        heroTl
          .from("#heroBadge",  { autoAlpha: 0, y: reduceMotion ? 0 : 20, duration: 0.5 })
          .from("#tl1", { autoAlpha: 0, y: reduceMotion ? 0 : 80, skewY: reduceMotion ? 0 : 4, ease: "power4.out", duration: 0.75 }, "<0.15")
          .from("#tl2", { autoAlpha: 0, y: reduceMotion ? 0 : 80, skewY: reduceMotion ? 0 : 3, ease: "power4.out", duration: 0.75 }, "<0.1")
          .from("#tl3", { autoAlpha: 0, y: reduceMotion ? 0 : 80, skewY: reduceMotion ? 0 : 2, ease: "power4.out", duration: 0.75 }, "<0.1")
          .from("#heroSub",    { autoAlpha: 0, y: reduceMotion ? 0 : 24 }, "<0.45")
          .from("#searchCard", { autoAlpha: 0, y: reduceMotion ? 0 : 32, ease: "back.out(1.4)" }, "<0.1")
          .from("#statsRow",   { autoAlpha: 0, y: reduceMotion ? 0 : 20 }, "<0.15")
          .from("#scrollCue",  { autoAlpha: 0, duration: 0.4 }, "<0.2");

        // ── Animated counter (gsap-core skill: function-based onUpdate) ──
        const countEl = document.querySelector(".count-num");
        if (countEl && !reduceMotion) {
          const target = parseInt(countEl.dataset.target, 10);
          heroTl.from(countEl, {
            innerText: 0,
            duration: 1.4,
            ease: "power2.out",
            snap: { innerText: 1 },
            onUpdate() {
              countEl.textContent = Math.round(
                parseFloat(this.targets()[0].innerText)
              );
            },
          }, "<0.3");
        }

        if (typeof ScrollTrigger === "undefined") return;

        // ── Section intros ──
        gsap.utils.toArray(".section-intro").forEach((el) => {
          gsap.from(el, {
            autoAlpha: 0,
            y: reduceMotion ? 0 : 40,
            duration: 0.7,
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              toggleActions: "play none none none",
              once: true,
            },
          });
        });

        // ── Step cards — ScrollTrigger.batch() (gsap-scrolltrigger skill) ──
        // Batch coordinates all cards that enter viewport together
        ScrollTrigger.batch(".step-card", {
          start: "top 88%",
          once: true,
          onEnter: (batch) =>
            gsap.from(batch, {
              autoAlpha: 0,
              y: reduceMotion ? 0 : 55,
              duration: 0.7,
              stagger: { each: 0.12, from: "start" },
              ease: "power3.out",
            }),
        });

        // Step connectors subtle fade
        gsap.utils.toArray(".step-connector").forEach((el) => {
          gsap.from(el, {
            autoAlpha: 0,
            duration: 0.5,
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          });
        });

        // ── Feature cards — ScrollTrigger.batch() with stagger from center ──
        ScrollTrigger.batch(".feat-card", {
          start: "top 90%",
          once: true,
          interval: 0.08,
          batchMax: 3,
          onEnter: (batch) =>
            gsap.from(batch, {
              autoAlpha: 0,
              y: reduceMotion ? 0 : 60,
              rotationX: reduceMotion ? 0 : 10,
              transformOrigin: "top center",
              duration: 0.75,
              stagger: { each: 0.1, from: "start" },
              ease: "back.out(1.2)",  // gsap-core skill: back easing for depth feel
            }),
        });

        // ── CTA section ──
        gsap.from("#ctaSection .cta-inner", {
          autoAlpha: 0,
          scale: reduceMotion ? 1 : 0.94,
          y: reduceMotion ? 0 : 30,
          duration: 0.75,
          ease: "back.out(1.4)",
          scrollTrigger: {
            trigger: "#ctaSection",
            start: "top 82%",
            once: true,
          },
        });

        // ── Hero parallax scrub (gsap-scrolltrigger skill: scrub) ──
        // scrub: 1 = 1s lag for smooth feel
        if (isDesktop && !reduceMotion) {
          // Hero title parallax
          gsap.to(".hero-title", {
            y: -100,
            ease: "none",
            scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 },
          });
          gsap.to(".hero-sub", {
            y: -50,
            ease: "none",
            scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1.5 },
          });
          // Deco text moves opposite direction — creates depth
          gsap.to(".hero-deco-text", {
            y: 60,
            ease: "none",
            scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.8 },
          });
        }

        // ── Marquee section pin reveal ──
        gsap.from(".marquee-section", {
          autoAlpha: 0,
          y: reduceMotion ? 0 : 30,
          duration: 0.6,
          scrollTrigger: {
            trigger: ".marquee-section",
            start: "top 90%",
            once: true,
          },
        });
      }
    );
  })();

  // ────────────────────────────────────────
  // 3D Card Tilt Effect
  // ────────────────────────────────────────
  document.querySelectorAll(".feat-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);

      card.style.transform = `perspective(600px) rotateX(${-dy * 8}deg) rotateY(${dx * 8}deg) scale(1.02)`;
      card.style.boxShadow = `${-dx * 10}px ${-dy * 10}px 40px rgba(0,0,0,0.3)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "perspective(600px) rotateX(0) rotateY(0) scale(1)";
      card.style.boxShadow = "";
      card.style.transition = "transform 0.5s ease, box-shadow 0.5s ease";
      setTimeout(() => { card.style.transition = ""; }, 500);
    });
  });

  // ────────────────────────────────────────
  // Duplicate marquee for infinite scroll
  // ────────────────────────────────────────
  const track = document.querySelector(".marquee-track");
  if (track) {
    track.innerHTML += track.innerHTML;
  }

  // ────────────────────────────────────────
  // Marquee pause on hover
  // ────────────────────────────────────────
  const marqueeOuter = document.querySelector(".marquee-outer");
  if (marqueeOuter) {
    marqueeOuter.addEventListener("mouseenter", () => { track.style.animationPlayState = "paused"; });
    marqueeOuter.addEventListener("mouseleave", () => { track.style.animationPlayState = "running"; });
  }

  // ────────────────────────────────────────
  // Theme Toggle
  // ────────────────────────────────────────
  const themeBtn = document.getElementById("themeToggle");
  const saved = localStorage.getItem("vd-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);

  themeBtn && themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("vd-theme", next);
  });

  // ────────────────────────────────────────
  // Platform Detection
  // ────────────────────────────────────────
  const PLATFORMS = [
    { name: "YouTube",      icon: "▶",  patterns: [/youtube\.com/, /youtu\.be/] },
    { name: "Instagram",    icon: "📷", patterns: [/instagram\.com/] },
    { name: "TikTok",       icon: "♪",  patterns: [/tiktok\.com/] },
    { name: "Facebook",     icon: "f",  patterns: [/facebook\.com/, /fb\.watch/] },
    { name: "Twitter / X",  icon: "𝕏",  patterns: [/twitter\.com/, /x\.com/] },
    { name: "Vimeo",        icon: "▷",  patterns: [/vimeo\.com/] },
    { name: "Dailymotion",  icon: "D",  patterns: [/dailymotion\.com/] },
    { name: "SoundCloud",   icon: "☁",  patterns: [/soundcloud\.com/] },
    { name: "Reddit",       icon: "⬡",  patterns: [/reddit\.com/, /redd\.it/] },
    { name: "Twitch",       icon: "◆",  patterns: [/twitch\.tv/] },
    { name: "Bilibili",     icon: "B",  patterns: [/bilibili\.com/, /b23\.tv/] },
    { name: "Pinterest",    icon: "P",  patterns: [/pinterest\./] },
  ];

  function detectPlatform(url) {
    for (const p of PLATFORMS) {
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
    } catch { return false; }
  }

  // ────────────────────────────────────────
  // DOM refs
  // ────────────────────────────────────────
  const urlInput      = document.getElementById("urlInput");
  const fetchBtn      = document.getElementById("fetchBtn");
  const btnLabel      = fetchBtn.querySelector(".btn-label");
  const btnSpinner    = fetchBtn.querySelector(".btn-spinner");
  const btnArrow      = fetchBtn.querySelector(".btn-arrow");
  const platformBadge = document.getElementById("platformBadge");
  const platformIcon  = document.getElementById("platformIcon");
  const platformName  = document.getElementById("platformName");
  const errorMsg      = document.getElementById("errorMsg");
  const modalOverlay  = document.getElementById("modalOverlay");
  const modalClose    = document.getElementById("modalClose");
  const thumbImg      = document.getElementById("thumbImg");
  const thumbWrap     = document.getElementById("thumbWrap");
  const durationBadge = document.getElementById("durationBadge");
  const videoTitle    = document.getElementById("videoTitle");
  const uploaderEl    = document.getElementById("uploader");
  const viewsEl       = document.getElementById("views");
  const videoFormats  = document.getElementById("videoFormats");
  const audioFormats  = document.getElementById("audioFormats");
  const toastEl       = document.getElementById("toast");
  const playOverlayBtn = document.getElementById("playOverlayBtn");
  const embedWrap     = document.getElementById("embedWrap");
  const embedFrame    = document.getElementById("embedFrame");
  const embedCloseBtn = document.getElementById("embedCloseBtn");

  // ────────────────────────────────────────
  // Input handler
  // ────────────────────────────────────────
  urlInput.addEventListener("input", () => {
    const val = urlInput.value.trim();
    const valid = isValidUrl(val);
    fetchBtn.disabled = !valid;

    const p = detectPlatform(val);
    if (p) {
      platformIcon.textContent = p.icon;
      platformName.textContent = p.name;
      platformBadge.classList.remove("hidden");
    } else {
      platformBadge.classList.add("hidden");
    }
    errorMsg.classList.add("hidden");
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !fetchBtn.disabled) fetchBtn.click();
  });

  // ────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────
  function fmtDuration(sec) {
    if (!sec) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${m}:${String(s).padStart(2,"0")}`;
  }

  function fmtViews(n) {
    if (!n) return "";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
    return `${n} views`;
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    setTimeout(() => toastEl.classList.add("hidden"), 3000);
  }

  function setLoading(on) {
    fetchBtn.disabled = on;
    btnLabel.classList.toggle("hidden", on);
    btnArrow && btnArrow.classList.toggle("hidden", on);
    btnSpinner.classList.toggle("hidden", !on);
  }

  // Extract YouTube video ID
  function getYouTubeId(url) {
    const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  // ────────────────────────────────────────
  // Fetch video info
  // ────────────────────────────────────────
  let currentUrl = "";
  let currentYtId = null;

  fetchBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    currentUrl = url;
    currentYtId = getYouTubeId(url);

    errorMsg.classList.add("hidden");
    setLoading(true);

    try {
      const res = await fetch(API_BASE + "/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      showModal(data);
    } catch (err) {
      const msg = err.message || "Something went wrong";
      // Choose icon based on error type
      let icon = "⚠️";
      if (/private|members/i.test(msg))        icon = "🔒";
      else if (/login|log in|sign in|cookie/i.test(msg)) icon = "🔑";
      else if (/geo|region|country/i.test(msg)) icon = "🌍";
      else if (/deleted|not found|unavailable/i.test(msg)) icon = "🗑️";
      else if (/expired|no longer/i.test(msg))  icon = "⏱️";
      errorMsg.innerHTML = `<span class="err-icon">${icon}</span><span>${msg}</span>`;
      errorMsg.classList.remove("hidden");
    } finally {
      setLoading(false);
    }
  });

  // ────────────────────────────────────────
  // Modal
  // ────────────────────────────────────────
  function showModal(data) {
    // Thumbnail
    thumbImg.src = data.thumbnail || "";
    thumbImg.onerror = () => { thumbImg.style.display = "none"; };
    thumbImg.onload  = () => { thumbImg.style.display = "block"; };

    // Duration badge
    const dur = fmtDuration(data.duration);
    durationBadge.textContent = dur;
    durationBadge.classList.toggle("hidden", !dur);

    // Info
    videoTitle.textContent  = data.title || "Untitled";
    uploaderEl.textContent  = data.uploader || "";
    viewsEl.textContent     = fmtViews(data.view_count);
    uploaderEl.style.display = data.uploader ? "" : "none";
    viewsEl.style.display    = data.view_count ? "" : "none";

    // YouTube embed button visibility
    playOverlayBtn.style.display = currentYtId ? "" : "";

    // Video formats
    const resolutions = [
      { label: "4K",    height: 2160 },
      { label: "2K",    height: 1440 },
      { label: "1080p", height: 1080 },
      { label: "720p",  height: 720  },
      { label: "480p",  height: 480  },
      { label: "360p",  height: 360  },
    ];

    videoFormats.innerHTML = "";
    resolutions.forEach((r) => {
      const available = data.availableResolutions.includes(r.height);
      const btn = document.createElement("button");
      btn.className = `dl-btn${available ? "" : " unavailable"}`;
      btn.textContent = r.label;
      if (available) {
        btn.addEventListener("click", () => startDownload(currentUrl, "mp4", `${r.height}p`));
      }
      videoFormats.appendChild(btn);
    });

    // Audio formats
    const audioOptions = [
      { label: "MP3 320k", type: "mp3", quality: "320" },
      { label: "MP3 192k", type: "mp3", quality: "192" },
      { label: "M4A",      type: "m4a", quality: ""    },
    ];

    audioFormats.innerHTML = "";
    audioOptions.forEach((a) => {
      const btn = document.createElement("button");
      btn.className = `dl-btn audio-btn${data.hasAudio ? "" : " unavailable"}`;
      btn.textContent = a.label;
      if (data.hasAudio) {
        btn.addEventListener("click", () => startDownload(currentUrl, a.type, a.quality));
      }
      audioFormats.appendChild(btn);
    });

    // Reset embed
    embedWrap.classList.add("hidden");
    thumbWrap.style.display = "";
    embedFrame.src = "";

    // Open modal with animation
    modalOverlay.classList.remove("hidden");

    if (typeof gsap !== "undefined") {
      gsap.fromTo(".modal",
        { opacity: 0, scale: 0.9, y: 30 },
        { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: "back.out(1.4)" }
      );
    }
  }

  // Play button — embed YouTube or open thumbnail
  playOverlayBtn.addEventListener("click", () => {
    if (currentYtId) {
      embedFrame.src = `https://www.youtube.com/embed/${currentYtId}?autoplay=1&rel=0`;
      thumbWrap.style.display = "none";
      embedWrap.classList.remove("hidden");
    }
  });

  embedCloseBtn.addEventListener("click", () => {
    embedFrame.src = "";
    embedWrap.classList.add("hidden");
    thumbWrap.style.display = "";
  });

  // Close modal
  function closeModal() {
    if (typeof gsap !== "undefined") {
      gsap.to(".modal", {
        opacity: 0, scale: 0.95, y: 20, duration: 0.25, ease: "power2.in",
        onComplete: () => {
          modalOverlay.classList.add("hidden");
          embedFrame.src = "";
          embedWrap.classList.add("hidden");
          thumbWrap.style.display = "";
        },
      });
    } else {
      modalOverlay.classList.add("hidden");
    }
  }

  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeModal();
  });

  // ────────────────────────────────────────
  // Download trigger
  // ────────────────────────────────────────
  function startDownload(url, type, quality) {
    const params = new URLSearchParams({ url, type, quality });
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/download?${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`⬇ Downloading ${type.toUpperCase()}${quality ? " " + quality : ""}…`);
  }

  // ────────────────────────────────────────
  // Nav scroll effect
  // ────────────────────────────────────────
  window.addEventListener("scroll", () => {
    const nav = document.getElementById("nav");
    if (window.scrollY > 60) {
      nav.style.background = getComputedStyle(document.documentElement)
        .getPropertyValue("--bg").trim() === "#06060f"
        ? "rgba(6,6,15,0.92)"
        : "rgba(244,244,252,0.92)";
    } else {
      nav.style.background = "";
    }
  }, { passive: true });

})();
