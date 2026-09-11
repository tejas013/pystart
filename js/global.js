(function initTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem("pystart-theme");
  // Temporarily ignore system dark-mode preference — dark theme colors
  // are still being audited for contrast bugs. Falls back to light
  // unless the person explicitly toggled dark via the button before.
  const theme = saved || "light";

  root.setAttribute("data-theme", theme);

  function updateThemeButton() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    const isDark = root.getAttribute("data-theme") === "dark";
    btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    btn.title = isDark ? "Switch to light mode" : "Switch to dark mode";

    const icon = btn.querySelector(".theme-icon");
    const label = btn.querySelector(".theme-label");

    if (icon) icon.textContent = isDark ? "☀" : "☾";
    if (label) label.textContent = isDark ? "Light" : "Dark";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("pystart-theme", theme);
    updateThemeButton();

    // Let the shared 3D hero adjust its lighting immediately.
    window.dispatchEvent(new CustomEvent("pystart-theme-change", {
      detail: { theme }
    }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateThemeButton();

    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
      });
    }
  });
})();

/* PyStart — shared JavaScript
   Common interactions + optional page features.
   This file is safe to include on every PyStart page.
*/

(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ---------------------------------------------------------
     Theme system
     --------------------------------------------------------- */
  function getPreferredTheme() {
    const saved = localStorage.getItem("pystart-theme");
    if (saved === "light" || saved === "dark") return saved;
    // Temporarily ignore system dark-mode preference — see note above.
    return "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    const toggle = document.getElementById("theme-toggle");
    if (toggle) {
      const dark = theme === "dark";
      toggle.setAttribute("aria-pressed", String(dark));
      toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      const icon = toggle.querySelector(".theme-icon");
      const label = toggle.querySelector(".theme-label");
      if (icon) icon.textContent = dark ? "☀" : "☾";
      if (label) label.textContent = dark ? "Light" : "Dark";
    }

    window.dispatchEvent(new CustomEvent("pystart-theme-change", { detail: { theme } }));
  }

  function initTheme() {
    const initial = getPreferredTheme();
    applyTheme(initial);

    const nav = document.querySelector("header nav, .top-nav");
    if (!nav || document.getElementById("theme-toggle")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "theme-toggle";
    button.className = "theme-toggle";
    button.innerHTML = '<span class="theme-icon" aria-hidden="true"></span><span class="theme-label"></span>';
    button.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("pystart-theme", next);
      applyTheme(next);
    });
    nav.appendChild(button);
    applyTheme(initial);
  }

  /* ---------------------------------------------------------
     Shared toast system
     --------------------------------------------------------- */
  window.showToast = function (message) {
    let stack = document.getElementById("toast-stack");

    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.id = "toast-stack";
      document.body.appendChild(stack);
    }

    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    stack.appendChild(el);

    setTimeout(() => el.remove(), 3200);
  };

  /* ---------------------------------------------------------
     Magnetic buttons
     --------------------------------------------------------- */
  function initMagneticButtons() {
    if (prefersReducedMotion || window.innerWidth <= 900) return;

    document.querySelectorAll(".magnetic").forEach((button) => {
      if (button.dataset.magneticReady) return;
      button.dataset.magneticReady = "true";

      button.addEventListener("mousemove", (e) => {
        const rect = button.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;

        button.style.transform =
          `translate(${relX * 0.25}px, ${relY * 0.4}px)`;
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "translate(0,0)";
      });
    });
  }

  /* ---------------------------------------------------------
     Cursor particle trail
     --------------------------------------------------------- */
  function initCursorTrail() {
    const canvas = document.getElementById("trail-canvas");
    if (!canvas || prefersReducedMotion) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener("resize", resize);

    const colors = ["#e08a1e", "#7c5cff", "#35a879", "#d78aa5"];
    let particles = [];
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let lastX = mouseX;
    let lastY = mouseY;

    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      const dist = Math.hypot(mouseX - lastX, mouseY - lastY);
      const count = Math.min(Math.floor(dist / 4), 6);

      for (let i = 0; i < count; i++) {
        const p = i / count;

        particles.push({
          x: lastX + (mouseX - lastX) * p + (Math.random() - 0.5) * 6,
          y: lastY + (mouseY - lastY) * p + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6 - 0.3,
          life: 1,
          size: 1.5 + Math.random() * 2.5,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }

      lastX = mouseX;
      lastY = mouseY;

      if (particles.length > 220) {
        particles.splice(0, particles.length - 220);
      }
    });

    function tick() {
      requestAnimationFrame(tick);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.018;
      });

      particles = particles.filter((p) => p.life > 0);

      particles.forEach((p) => {
        ctx.globalAlpha = Math.max(p.life, 0) * 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    tick();
  }

  /* ---------------------------------------------------------
     Optional Pyodide editor
     --------------------------------------------------------- */
  let pyodideReady = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        if (window.loadPyodide || window.THREE) resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function initPyodide() {
    if (!pyodideReady) {
      await loadScript(
        "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js"
      );
      pyodideReady = window.loadPyodide();
    }

    return pyodideReady;
  }

  window.runCode = async function () {
    const btn = document.getElementById("run-btn");
    const out = document.getElementById("output");
    const codeEl = document.getElementById("code");

    if (!btn || !out || !codeEl) return;

    const code = codeEl.value;

    btn.disabled = true;
    btn.textContent = "⏳ Loading...";
    out.innerHTML =
      '<div class="skeleton">' +
      '<div class="skeleton-line" style="width:70%"></div>' +
      '<div class="skeleton-line" style="width:45%"></div>' +
      "</div>";

    try {
      const pyodide = await initPyodide();

      btn.textContent = "▶ Run";

      pyodide.runPython(
        "import sys, io\nsys.stdout = io.StringIO()"
      );
      pyodide.runPython(code);

      const result = pyodide.runPython("sys.stdout.getvalue()");

      out.textContent =
        result || "(koi output nahi — print() use karo)";

      showToast("Code chal gaya ✅");
    } catch (err) {
      out.textContent = "Error:\n" + err.message;
      showToast("Code mein error hai ⚠️");
    } finally {
      btn.disabled = false;
      btn.textContent = "▶ Run";
    }
  };

  /* ---------------------------------------------------------
     Shared 3D hero
     Only initializes on pages containing #canvas-wrap.
     --------------------------------------------------------- */
  async function initThreeHero() {
    const wrap = document.getElementById("canvas-wrap");
    if (!wrap || prefersReducedMotion) return;

    try {
      await loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
      );
    } catch {
      return;
    }

    if (typeof THREE === "undefined") return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    camera.position.set(0, 0, 7);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.45));

    const rim1 = new THREE.PointLight(0x7c5cff, 48, 24);
    rim1.position.set(4, 3, 4);
    scene.add(rim1);

    const rim2 = new THREE.PointLight(0xe08a1e, 38, 24);
    rim2.position.set(-3, -2, 3);
    scene.add(rim2);

    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 5, 6);
    scene.add(key);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    const knotMat = new THREE.MeshStandardMaterial({
      color: 0x24252b,
      metalness: 0.72,
      roughness: 0.24,
      emissive: 0x111217,
      emissiveIntensity: 0.16
    });

    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.35, 0.44, 220, 32, 2, 3),
      knotMat
    );
    mainGroup.add(knot);

    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x101116,
      metalness: 0.82,
      roughness: 0.22,
      emissive: 0x05060a,
      emissiveIntensity: 0.10
    });

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 32, 32),
      innerMat
    );
    mainGroup.add(core);

    const orbitGroup = new THREE.Group();
    mainGroup.add(orbitGroup);

    const ringMat1 = new THREE.MeshStandardMaterial({
      color: 0x3a3b42,
      metalness: 0.9,
      roughness: 0.16,
      emissive: 0x17181d,
      emissiveIntensity: 0.22
    });

    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.028, 18, 200),
      ringMat1
    );

    ring1.rotation.x = Math.PI * 0.58;
    ring1.rotation.z = Math.PI * 0.12;
    orbitGroup.add(ring1);

    const ringMat2 = new THREE.MeshStandardMaterial({
      color: 0x5b5c65,
      metalness: 0.88,
      roughness: 0.18,
      emissive: 0x17141f,
      emissiveIntensity: 0.2
    });

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.08, 0.018, 16, 200),
      ringMat2
    );

    ring2.rotation.x = Math.PI * 0.34;
    ring2.rotation.y = Math.PI * 0.18;
    ring2.rotation.z = -Math.PI * 0.2;
    orbitGroup.add(ring2);

    const diamondMat = new THREE.MeshStandardMaterial({
      color: 0x16171c,
      metalness: 0.9,
      roughness: 0.12,
      emissive: 0x25232b,
      emissiveIntensity: 0.55
    });

    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 1),
      diamondMat
    );
    orbitGroup.add(diamond);

    const diamond2Mat = new THREE.MeshStandardMaterial({
      color: 0x30313a,
      metalness: 0.92,
      roughness: 0.1,
      emissive: 0x18151f,
      emissiveIntensity: 0.45
    });

    const diamond2 = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.095, 1),
      diamond2Mat
    );
    orbitGroup.add(diamond2);

    const lightDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    orbitGroup.add(lightDot);

    let orbitAngle1 = 0;
    let orbitAngle2 = Math.PI;

    function update3DPosition() {
      const width = window.innerWidth;

      if (width > 1200) {
        mainGroup.position.set(2.4, 0, -1);
        mainGroup.scale.setScalar(1);
      } else if (width > 900) {
        mainGroup.position.set(2.05, 0, -1);
        mainGroup.scale.setScalar(0.85);
      } else if (width > 600) {
        mainGroup.position.set(1.0, -1.5, -1);
        mainGroup.scale.setScalar(0.7);
      } else {
        mainGroup.position.set(0, -2.15, -1);
        mainGroup.scale.setScalar(0.55);
      }
    }

    update3DPosition();

    function onResize() {
      const width = window.innerWidth;
      const height = window.innerHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      update3DPosition();
    }

    window.addEventListener("resize", onResize);

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    window.addEventListener("mousemove", (e) => {
      if (window.innerWidth <= 900) {
        targetX = 0;
        targetY = 0;
        return;
      }

      targetX = (e.clientX / window.innerWidth) * 2 - 1;
      targetY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    let t = 0;

    function updateThreeTheme(theme) {
      const dark = theme === "dark";

      knotMat.color.setHex(dark ? 0x9da3b3 : 0x24252b);
      knotMat.emissive.setHex(dark ? 0x3a4050 : 0x111217);
      knotMat.emissiveIntensity = dark ? 0.24 : 0.16;

      innerMat.color.setHex(dark ? 0xf0f2f7 : 0x101116);
      innerMat.emissive.setHex(dark ? 0x7c5cff : 0x05060a);
      innerMat.emissiveIntensity = dark ? 0.32 : 0.10;

      ringMat1.color.setHex(dark ? 0x8b91a0 : 0x3a3b42);
      ringMat1.emissive.setHex(dark ? 0x343847 : 0x17181d);

      ringMat2.color.setHex(dark ? 0xa3a8b5 : 0x5b5c65);
      ringMat2.emissive.setHex(dark ? 0x3d304e : 0x17141f);

      diamondMat.color.setHex(dark ? 0x6f7585 : 0x16171c);
      diamond2Mat.color.setHex(dark ? 0x8b91a0 : 0x30313a);
    }

    updateThreeTheme(document.documentElement.getAttribute("data-theme") || "light");
    window.addEventListener("pystart-theme-change", (event) => {
      updateThreeTheme(event.detail.theme);
    });

    function updateHeroTheme() {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (renderer) {
        renderer.setClearColor(dark ? 0x030405 : 0xf6f7fb, dark ? 1 : 0);
      }
    }

    window.addEventListener("pystart-theme-change", updateHeroTheme);
    updateHeroTheme();


    function animate() {
      requestAnimationFrame(animate);
      t += 0.005;

      knot.rotation.x = t * 0.48;
      knot.rotation.y = t * 0.82;
      knot.rotation.z = Math.sin(t * 0.35) * 0.08;

      core.rotation.x = -t * 0.7;
      core.rotation.y = t * 0.9;
      core.rotation.z = t * 0.35;

      const width = window.innerWidth;
      const baseY =
        width > 1200 ? 0 :
        width > 900 ? 0 :
        width > 600 ? -1.5 : -2.15;

      mainGroup.position.y =
        baseY + Math.sin(t * 1.05) * (width <= 600 ? 0.10 : 0.27);

      orbitGroup.rotation.y = t * 0.42;
      orbitGroup.rotation.x = Math.sin(t * 0.35) * 0.12;
      orbitGroup.rotation.z = Math.cos(t * 0.28) * 0.08;

      ring1.rotation.y = t * 0.65;
      ring1.rotation.z = Math.sin(t * 0.55) * 0.15;

      ring2.rotation.x =
        Math.PI * 0.34 + Math.sin(t * 0.45) * 0.16;
      ring2.rotation.y = t * -0.4;

      orbitAngle1 += 0.018;
      const radius1 = 1.85;

      diamond.position.x = Math.cos(orbitAngle1) * radius1;
      diamond.position.y =
        Math.sin(orbitAngle1) * radius1 * 0.42;
      diamond.position.z =
        Math.sin(orbitAngle1) * radius1 * 0.82;

      diamond.rotation.x = t * 2.0;
      diamond.rotation.y = t * 3.0;

      orbitAngle2 -= 0.012;
      const radius2 = 2.05;

      diamond2.position.x = Math.cos(orbitAngle2) * radius2;
      diamond2.position.y =
        Math.sin(orbitAngle2) * radius2 * 0.28;
      diamond2.position.z =
        Math.sin(orbitAngle2) * radius2 * 0.92;

      diamond2.rotation.x = -t * 2.5;
      diamond2.rotation.z = t * 2.0;

      lightDot.position.x =
        Math.cos(orbitAngle1 + 1.5) * 1.9;
      lightDot.position.y =
        Math.sin(orbitAngle1 + 1.5) * 1.9 * 0.42;
      lightDot.position.z =
        Math.sin(orbitAngle1 + 1.5) * 1.9 * 0.82;

      knotMat.emissiveIntensity =
        0.13 + Math.sin(t * 0.7) * 0.045;

      ringMat1.emissiveIntensity =
        0.16 + Math.sin(t * 0.8) * 0.08;

      ringMat2.emissiveIntensity =
        0.14 + Math.cos(t * 0.7) * 0.07;

      rim1.position.set(
        Math.cos(t * 0.55) * 5,
        3 + Math.sin(t * 0.45) * 1.5,
        Math.sin(t * 0.55) * 5
      );

      rim2.position.set(
        Math.cos(t * 0.38 + 2) * 4,
        -2 + Math.cos(t * 0.5) * 1.5,
        Math.sin(t * 0.38 + 2) * 4
      );

      curX += (targetX - curX) * 0.035;
      curY += (targetY - curY) * 0.035;

      const driftX = Math.sin(t * 0.16) * 0.08;
      const driftY = Math.cos(t * 0.13) * 0.05;

      camera.position.x = curX * 0.75 + driftX;
      camera.position.y = -curY * 0.5 + driftY;
      camera.position.z = 7 + Math.sin(t * 0.12) * 0.08;

      camera.lookAt(1.0, 0.1, -0.5);

      renderer.render(scene, camera);
    }

    animate();
  }


  /* ---------------------------------------------------------
     Error Dictionary search
     Works on any page containing #search + .error-card.
     --------------------------------------------------------- */
  window.filterErrors = function () {
    const search = document.getElementById("search");
    const list = document.getElementById("error-list");
    const count = document.getElementById("count");
    const noResults = document.getElementById("no-results");

    if (!search || !list) return;

    const query = search.value.trim().toLowerCase();
    const cards = list.querySelectorAll(".error-card");
    let visible = 0;

    cards.forEach((card) => {
      const searchable =
        (card.getAttribute("data-search") || "").toLowerCase();

      const match = !query || searchable.includes(query);
      card.style.display = match ? "" : "none";

      if (match) visible++;
    });

    if (count) {
      count.textContent = query
        ? `${visible} ${visible === 1 ? "error" : "errors"} mile`
        : `${cards.length} common errors`;
    }

    if (noResults) {
      noResults.style.display = visible === 0 ? "block" : "none";
    }
  };

  function initErrorDictionary() {
    const search = document.getElementById("search");
    if (!search) return;

    search.addEventListener("input", window.filterErrors);
    window.filterErrors();
  }

  /* ---------------------------------------------------------
     Boot shared features
     --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initMagneticButtons();
    initCursorTrail();
    initThreeHero();
    initErrorDictionary();
  });
})();
