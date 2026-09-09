(() => {
  "use strict";

  /* =========================================================
     PyStart Global JS
     ========================================================= */

  const root = document.documentElement;

  /* =========================================================
     THEME SYSTEM
     ========================================================= */

  // Load saved theme immediately.
  const savedTheme = localStorage.getItem("pystart-theme");

  if (savedTheme === "dark" || savedTheme === "light") {
    root.setAttribute("data-theme", savedTheme);
  } else {
    root.setAttribute("data-theme", "light");
  }

  function updateThemeButton() {
    const button = document.getElementById("theme-toggle");

    if (!button) return;

    const isDark =
      root.getAttribute("data-theme") === "dark";

    const icon =
      button.querySelector(".theme-icon");

    const label =
      button.querySelector(".theme-label");

    if (icon) {
      icon.textContent = isDark ? "☀" : "☾";
    }

    if (label) {
      label.textContent = isDark ? "Light" : "Dark";
    }

    button.setAttribute(
      "aria-label",
      isDark
        ? "Switch to light mode"
        : "Switch to dark mode"
    );

    button.title =
      isDark
        ? "Switch to light mode"
        : "Switch to dark mode";
  }

  function setTheme(theme) {

    root.setAttribute("data-theme", theme);

    localStorage.setItem(
      "pystart-theme",
      theme
    );

    updateThemeButton();

    /*
      Tell other systems, especially the
      Three.js hero, that the theme changed.
    */

    window.dispatchEvent(
      new CustomEvent(
        "pystart-theme-change",
        {
          detail: {
            theme: theme
          }
        }
      )
    );
  }

  function initTheme() {

    updateThemeButton();

    const button =
      document.getElementById("theme-toggle");

    if (!button) return;

    button.addEventListener("click", () => {

      const current =
        root.getAttribute("data-theme");

      const next =
        current === "dark"
          ? "light"
          : "dark";

      setTheme(next);
    });
  }

  /* =========================================================
     TOAST
     ========================================================= */

  window.showToast = function(message) {

    let toast =
      document.getElementById(
        "pystart-toast"
      );

    if (!toast) {

      toast =
        document.createElement("div");

      toast.id =
        "pystart-toast";

      Object.assign(
        toast.style,
        {
          position: "fixed",
          right: "18px",
          bottom: "18px",
          zIndex: "9999",

          padding: "11px 15px",

          borderRadius: "10px",

          background: "var(--surface-2)",
          color: "var(--text)",

          border: "1px solid var(--border)",

          boxShadow: "var(--shadow)",

          font:
            "600 12px Sora, sans-serif",

          opacity: "0",

          transform:
            "translateY(8px)",

          transition:
            "all .2s ease"
        }
      );

      document.body.appendChild(toast);
    }

    toast.textContent = message;

    requestAnimationFrame(() => {

      toast.style.opacity = "1";

      toast.style.transform =
        "translateY(0)";
    });

    clearTimeout(
      window.__pystartToast
    );

    window.__pystartToast =
      setTimeout(() => {

        toast.style.opacity = "0";

        toast.style.transform =
          "translateY(8px)";

      }, 2200);
  };

  /* =========================================================
     DYNAMIC SCRIPT LOADER
     ========================================================= */

  function loadScript(src) {

    return new Promise(
      (resolve, reject) => {

        const existing =
          document.querySelector(
            `script[src="${src}"]`
          );

        if (existing) {

          if (
            src.includes("pyodide") &&
            window.loadPyodide
          ) {
            resolve();
            return;
          }

          if (
            src.includes("three") &&
            window.THREE
          ) {
            resolve();
            return;
          }

          existing.addEventListener(
            "load",
            resolve,
            { once: true }
          );

          existing.addEventListener(
            "error",
            reject,
            { once: true }
          );

          return;
        }

        const script =
          document.createElement(
            "script"
          );

        script.src = src;

        script.onload = resolve;

        script.onerror = reject;

        document.head.appendChild(
          script
        );
      }
    );
  }

  /* =========================================================
     PYTHON / PYODIDE
     ========================================================= */

  let pyodidePromise = null;

  async function getPyodide() {

    if (!pyodidePromise) {

      await loadScript(
        "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js"
      );

      pyodidePromise =
        window.loadPyodide();
    }

    return pyodidePromise;
  }

  window.runCode =
    async function() {

      const editor =
        document.getElementById(
          "code"
        );

      const output =
        document.getElementById(
          "output"
        );

      const button =
        document.getElementById(
          "run-btn"
        );

      if (!editor || !output) {
        return;
      }

      const originalText =
        button
          ? button.textContent
          : "";

      if (button) {

        button.disabled = true;

        button.textContent =
          "Loading...";
      }

      output.textContent =
        "Loading Python...";

      try {

        const pyodide =
          await getPyodide();

        /*
          Reset stdout before
          every execution.
        */

        pyodide.runPython(`
import sys
import io
sys.stdout = io.StringIO()
`);

        /*
          Execute the user's
          Python code.
        */

        pyodide.runPython(
          editor.value
        );

        const result =
          pyodide.runPython(
            "sys.stdout.getvalue()"
          );

        output.textContent =
          result ||
          "(No output — use print())";

        if (window.showToast) {

          window.showToast(
            "Code ran successfully"
          );
        }

      } catch (error) {

        output.textContent =
          "Error:\n" +
          (
            error?.message ||
            String(error)
          );

        if (window.showToast) {

          window.showToast(
            "There is an error in your code"
          );
        }

      } finally {

        if (button) {

          button.disabled = false;

          button.textContent =
            originalText ||
            "Run Code";
        }
      }
    };

  /* =========================================================
     MAGNETIC BUTTONS
     ========================================================= */

  function initMagneticButtons() {

    document
      .querySelectorAll(".magnetic")
      .forEach((element) => {

        element.addEventListener(
          "mousemove",
          (event) => {

            const rect =
              element.getBoundingClientRect();

            const x =
              (
                (event.clientX - rect.left) /
                rect.width -
                0.5
              ) * 7;

            const y =
              (
                (event.clientY - rect.top) /
                rect.height -
                0.5
              ) * 7;

            element.style.transform =
              `translate(${x}px, ${y}px)`;
          }
        );

        element.addEventListener(
          "mouseleave",
          () => {

            element.style.transform =
              "";
          }
        );
      });
  }

  /* =========================================================
     ERROR DICTIONARY SEARCH
     ========================================================= */

  window.filterErrors =
    function() {

      const search =
        document.getElementById(
          "search"
        );

      if (!search) return;

      const query =
        search.value
          .trim()
          .toLowerCase();

      const cards =
        document.querySelectorAll(
          ".error-card"
        );

      let visible = 0;

      cards.forEach((card) => {

        const match =
          card.textContent
            .toLowerCase()
            .includes(query);

        card.style.display =
          match
            ? ""
            : "none";

        if (match) {
          visible++;
        }
      });

      const noResults =
        document.getElementById(
          "no-results"
        );

      if (noResults) {

        noResults.style.display =
          visible
            ? "none"
            : "block";
      }
    };

  function initErrorDictionary() {

    const search =
      document.getElementById(
        "search"
      );

    if (!search) return;

    search.addEventListener(
      "input",
      window.filterErrors
    );
  }

  /* =========================================================
     KEYBOARD SHORTCUT
     Ctrl + Enter = Run Python
     ========================================================= */

  function initEditorShortcut() {

    const editor =
      document.getElementById(
        "code"
      );

    if (!editor) return;

    editor.addEventListener(
      "keydown",
      (event) => {

        if (
          event.ctrlKey &&
          event.key === "Enter"
        ) {

          event.preventDefault();

          if (
            typeof window.runCode ===
            "function"
          ) {
            window.runCode();
          }
        }
      }
    );
  }

  /* =========================================================
     3D HERO
     ========================================================= */

  let threeInitialized = false;

  async function initThreeHero() {

    const container =
      document.getElementById(
        "canvas-wrap"
      );

    if (!container) return;

    /*
      Respect reduced-motion
      accessibility setting.
    */

    if (
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
    ) {
      return;
    }

    if (threeInitialized) return;

    threeInitialized = true;

    try {

      await loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
      );

      if (!window.THREE) return;

      const THREE =
        window.THREE;

      /* -------------------------
         Scene
         ------------------------- */

      const scene =
        new THREE.Scene();

      /* -------------------------
         Camera
         ------------------------- */

      const camera =
        new THREE.PerspectiveCamera(
          45,
          container.clientWidth /
            Math.max(
              container.clientHeight,
              1
            ),
          0.1,
          100
        );

      camera.position.set(
        0,
        0,
        7
      );

      /* -------------------------
         Renderer
         ------------------------- */

      const renderer =
        new THREE.WebGLRenderer({
          antialias: true,
          alpha: true
        });

      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          2
        )
      );

      renderer.setSize(
        container.clientWidth,
        container.clientHeight
      );

      renderer.outputEncoding =
        THREE.sRGBEncoding;

      container.appendChild(
        renderer.domElement
      );

      /* -------------------------
         Lights
         ------------------------- */

      const ambientLight =
        new THREE.AmbientLight(
          0xffffff,
          0.48
        );

      scene.add(
        ambientLight
      );

      const coreLight =
        new THREE.PointLight(
          0xffffff,
          2.0,
          12
        );

      coreLight.position.set(
        0,
        0,
        1.2
      );

      scene.add(
        coreLight
      );

      const violetLight =
        new THREE.PointLight(
          0x7c5cff,
          2.0,
          12
        );

      violetLight.position.set(
        -3,
        2,
        2
      );

      scene.add(
        violetLight
      );

      const mintLight =
        new THREE.PointLight(
          0x35a879,
          1.8,
          12
        );

      mintLight.position.set(
        3,
        -2,
        1
      );

      scene.add(
        mintLight
      );

      /* -------------------------
         Main metallic Torus Knot
         ------------------------- */

      const knotGeometry =
        new THREE.TorusKnotGeometry(
          1.22,
          0.28,
          180,
          32
        );

      const knotMaterial =
        new THREE.MeshStandardMaterial({
          color: 0x202632,
          metalness: 0.9,
          roughness: 0.22
        });

      const knot =
        new THREE.Mesh(
          knotGeometry,
          knotMaterial
        );

      scene.add(knot);

      /* -------------------------
         Central sphere/core
         ------------------------- */

      const coreGeometry =
        new THREE.SphereGeometry(
          0.34,
          48,
          48
        );

      const coreMaterial =
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.35,
          roughness: 0.12,
          emissive: 0xffffff,
          emissiveIntensity: 0.55
        });

      const core =
        new THREE.Mesh(
          coreGeometry,
          coreMaterial
        );

      scene.add(core);

      /* -------------------------
         Core glow
         ------------------------- */

      const glowGeometry =
        new THREE.SphereGeometry(
          0.49,
          40,
          40
        );

      const glowMaterial =
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.055,
          blending:
            THREE.AdditiveBlending,
          depthWrite: false
        });

      const glow =
        new THREE.Mesh(
          glowGeometry,
          glowMaterial
        );

      scene.add(glow);

      /* -------------------------
         Orbital rings
         ------------------------- */

      const ringMaterials = [
        new THREE.MeshBasicMaterial({
          color: 0x7c5cff,
          transparent: true,
          opacity: 0.45
        }),

        new THREE.MeshBasicMaterial({
          color: 0x35a879,
          transparent: true,
          opacity: 0.42
        }),

        new THREE.MeshBasicMaterial({
          color: 0xe08a1e,
          transparent: true,
          opacity: 0.38
        })
      ];

      const rings = [];

      const ringData = [
        [2.05, 0.018, 0.2, 0.55],
        [2.38, 0.014, -0.7, -0.4],
        [2.72, 0.011, 0.9, 0.28]
      ];

      ringData.forEach(
        (data, index) => {

          const geometry =
            new THREE.TorusGeometry(
              data[0],
              data[1],
              12,
              160
            );

          const ring =
            new THREE.Mesh(
              geometry,
              ringMaterials[index]
            );

          ring.rotation.x =
            data[2];

          ring.rotation.y =
            data[3];

          scene.add(ring);

          rings.push(ring);
        }
      );

      /* -------------------------
         Floating octahedrons
         ------------------------- */

      const floatingObjects = [];

      const octaGeometry =
        new THREE.OctahedronGeometry(
          0.10,
          0
        );

      const objectColors = [
        0x7c5cff,
        0x35a879,
        0xe08a1e
      ];

      for (let i = 0; i < 9; i++) {

        const material =
          new THREE.MeshStandardMaterial({
            color:
              objectColors[
                i %
                objectColors.length
              ],
            metalness: 0.7,
            roughness: 0.25,
            emissive:
              objectColors[
                i %
                objectColors.length
              ],
            emissiveIntensity: 0.15
          });

        const object =
          new THREE.Mesh(
            octaGeometry,
            material
          );

        const angle =
          (i / 9) *
          Math.PI *
          2;

        const radius =
          2.8 +
          (i % 3) * 0.35;

        object.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * 0.65,
          (i % 3) - 1
        );

        object.userData = {
          angle: angle,
          radius: radius,
          speed:
            0.18 +
            (i % 4) * 0.025,
          offset:
            i * 0.7
        };

        scene.add(object);

        floatingObjects.push(
          object
        );
      }

      /* -------------------------
         Mouse parallax
         ------------------------- */

      const mouse = {
        x: 0,
        y: 0
      };

      const targetMouse = {
        x: 0,
        y: 0
      };

      container.addEventListener(
        "pointermove",
        (event) => {

          const rect =
            container.getBoundingClientRect();

          targetMouse.x =
            (
              (event.clientX -
                rect.left) /
                rect.width -
              0.5
            );

          targetMouse.y =
            (
              (event.clientY -
                rect.top) /
                rect.height -
              0.5
            );
        }
      );

      container.addEventListener(
        "pointerleave",
        () => {
          targetMouse.x = 0;
          targetMouse.y = 0;
        }
      );

      /* -------------------------
         Resize
         ------------------------- */

      function resize() {

        const width =
          Math.max(
            container.clientWidth,
            1
          );

        const height =
          Math.max(
            container.clientHeight,
            1
          );

        camera.aspect =
          width / height;

        camera.updateProjectionMatrix();

        renderer.setSize(
          width,
          height
        );
      }

      window.addEventListener(
        "resize",
        resize
      );

      /* -------------------------
         Theme lighting
         ------------------------- */

      function updateHeroTheme() {

        const dark =
          root.getAttribute(
            "data-theme"
          ) === "dark";

        if (dark) {

          knotMaterial.color.setHex(
            0x11151d
          );

          coreMaterial.color.setHex(
            0x8f98ad
          );

          coreMaterial.emissive.setHex(
            0x59657d
          );

          coreMaterial.emissiveIntensity =
            1.15;

          glowMaterial.color.setHex(
            0x78839b
          );

          glowMaterial.opacity =
            0.085;

          coreLight.color.setHex(
            0xbfc8dc
          );

          coreLight.intensity =
            4.2;

          ambientLight.intensity =
            0.22;

          violetLight.intensity =
            1.35;

          mintLight.intensity =
            1.15;

        } else {

          knotMaterial.color.setHex(
            0x202632
          );

          coreMaterial.color.setHex(
            0xffffff
          );

          coreMaterial.emissive.setHex(
            0xffffff
          );

          coreMaterial.emissiveIntensity =
            0.55;

          glowMaterial.color.setHex(
            0xffffff
          );

          glowMaterial.opacity =
            0.055;

          coreLight.color.setHex(
            0xffffff
          );

          coreLight.intensity =
            2.0;

          ambientLight.intensity =
            0.48;

          violetLight.intensity =
            2.0;

          mintLight.intensity =
            1.8;
        }
      }

      window.addEventListener(
        "pystart-theme-change",
        updateHeroTheme
      );

      updateHeroTheme();

      /* -------------------------
         Animation
         ------------------------- */

      const clock =
        new THREE.Clock();

      function animate() {

        requestAnimationFrame(
          animate
        );

        const elapsed =
          clock.getElapsedTime();

        /*
          Smooth mouse movement
        */

        mouse.x +=
          (
            targetMouse.x -
            mouse.x
          ) * 0.045;

        mouse.y +=
          (
            targetMouse.y -
            mouse.y
          ) * 0.045;

        /*
          Main knot
        */

        knot.rotation.x =
          elapsed * 0.17;

        knot.rotation.y =
          elapsed * 0.24;

        knot.rotation.z =
          Math.sin(
            elapsed * 0.35
          ) * 0.08;

        /*
          Core
        */

        core.position.y =
          Math.sin(
            elapsed * 1.15
          ) * 0.035;

        core.rotation.y =
          elapsed * 0.25;

        glow.position.copy(
          core.position
        );

        const pulse =
          1 +
          Math.sin(
            elapsed * 2
          ) * 0.045;

        glow.scale.setScalar(
          pulse
        );

        /*
          Rings
        */

        rings.forEach(
          (ring, index) => {

            ring.rotation.z +=
              (
                index % 2 === 0
                  ? 1
                  : -1
              ) *
              0.0015;

            ring.rotation.y +=
              0.0009;
          }
        );

        /*
          Floating objects
        */

        floatingObjects.forEach(
          (object) => {

            const data =
              object.userData;

            const angle =
              data.angle +
              elapsed *
              data.speed;

            object.position.x =
              Math.cos(angle) *
              data.radius;

            object.position.y =
              Math.sin(angle) *
              data.radius *
              0.65;

            object.position.z =
              Math.sin(
                elapsed +
                data.offset
              ) * 1.1;

            object.rotation.x +=
              0.008;

            object.rotation.y +=
              0.011;
          }
        );

        /*
          Camera parallax
        */

        camera.position.x +=
          (
            mouse.x * 0.65 -
            camera.position.x
          ) * 0.025;

        camera.position.y +=
          (
            -mouse.y * 0.45 -
            camera.position.y
          ) * 0.025;

        camera.lookAt(
          0,
          0,
          0
        );

        renderer.render(
          scene,
          camera
        );
      }

      resize();
      animate();

    } catch (error) {

      console.warn(
        "PyStart 3D hero could not load:",
        error
      );
    }
  }

  /* =========================================================
     START
     ========================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      initTheme();

      initMagneticButtons();

      initErrorDictionary();

      initEditorShortcut();

      initThreeHero();
    }
  );

})();
