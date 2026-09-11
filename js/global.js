/* PyStart — shared JavaScript
   Common interactions used across every PyStart page.
   Single light theme — no dark-mode toggle (removed to avoid
   the color-conflict bugs from the earlier dual-theme system).
*/

(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

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
     Shared 3D hero (single light look — no theme branching)
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

    scene.add(new THREE.AmbientLight(0x6a5d75, 0.85));

    const rim1 = new THREE.PointLight(0xa78bfa, 55, 24);
    rim1.position.set(4, 3, 4);
    scene.add(rim1);

    const rim2 = new THREE.PointLight(0xe8a0c4, 42, 24);
    rim2.position.set(-3, -2, 3);
    scene.add(rim2);

    const key = new THREE.DirectionalLight(0xd8c8e0, 0.6);
    key.position.set(2, 5, 6);
    scene.add(key);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    const knotMat = new THREE.MeshStandardMaterial({
      color: 0x6b5a63,
      metalness: 0.6,
      roughness: 0.26,
      emissive: 0xd88bb0,
      emissiveIntensity: 0.32
    });

    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.35, 0.44, 220, 32, 2, 3),
      knotMat
    );
    mainGroup.add(knot);

    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x4a4050,
      metalness: 0.75,
      roughness: 0.24,
      emissive: 0x6a4a5c,
      emissiveIntensity: 0.22
    });

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 32, 32),
      innerMat
    );
    mainGroup.add(core);

    const orbitGroup = new THREE.Group();
    mainGroup.add(orbitGroup);

    const ringMat1 = new THREE.MeshStandardMaterial({
      color: 0x5c505f,
      metalness: 0.85,
      roughness: 0.18,
      emissive: 0x8b6d90,
      emissiveIntensity: 0.28
    });

    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.028, 18, 200),
      ringMat1
    );

    ring1.rotation.x = Math.PI * 0.58;
    ring1.rotation.z = Math.PI * 0.12;
    orbitGroup.add(ring1);

    const ringMat2 = new THREE.MeshStandardMaterial({
      color: 0x6e6270,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0xd8a0c0,
      emissiveIntensity: 0.24
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
      color: 0x4a3d45,
      metalness: 0.88,
      roughness: 0.14,
      emissive: 0xe08bb8,
      emissiveIntensity: 0.6
    });

    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 1),
      diamondMat
    );
    orbitGroup.add(diamond);

    const diamond2Mat = new THREE.MeshStandardMaterial({
      color: 0x5a4d55,
      metalness: 0.9,
      roughness: 0.12,
      emissive: 0xffb84d,
      emissiveIntensity: 0.5
    });

    const diamond2 = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.095, 1),
      diamond2Mat
    );
    orbitGroup.add(diamond2);

    const lightDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xf0c2dc })
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
    initMagneticButtons();
    initCursorTrail();
    initThreeHero();
    initErrorDictionary();
  });
})();
