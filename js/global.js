/* =========================================================
   PySTART — GLOBAL JAVASCRIPT
   Shared theme, editor, errors, buttons and 3D hero.
   ========================================================= */

(function () {
  "use strict";

  /* ---------- THEME ---------- */

  const THEME_KEY = "pystart-theme";

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);

    if (saved === "light" || saved === "dark") {
      return saved;
    }

    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function updateThemeButton(theme) {
    const buttons = document.querySelectorAll("#theme-toggle, .theme-toggle");

    buttons.forEach((button) => {
      const icon = button.querySelector(".theme-icon");
      const label = button.querySelector(".theme-label");

      if (theme === "dark") {
        if (icon) icon.textContent = "☀";
        if (label) label.textContent = "Light";
        button.setAttribute("aria-label", "Switch to light mode");
        button.setAttribute("title", "Switch to light mode");
      } else {
        if (icon) icon.textContent = "☾";
        if (label) label.textContent = "Dark";
        button.setAttribute("aria-label", "Switch to dark mode");
        button.setAttribute("title", "Switch to dark mode");
      }
    });
  }

  function applyTheme(theme, save) {
    const validTheme = theme === "dark" ? "dark" : "light";

    // This is the important part: the CSS uses html[data-theme="dark"].
    document.documentElement.setAttribute("data-theme", validTheme);

    if (save) {
      localStorage.setItem(THEME_KEY, validTheme);
    }

    updateThemeButton(validTheme);

    // Tell the 3D scene to update its lighting.
    window.dispatchEvent(
      new CustomEvent("pystart-theme-change", {
        detail: { theme: validTheme }
      })
    );
  }

  function initTheme() {
    // Apply immediately so there is no flash of the wrong theme.
    const theme = getPreferredTheme();
    applyTheme(theme, false);

    const buttons = document.querySelectorAll("#theme-toggle, .theme-toggle");

    buttons.forEach((button) => {
      // Prevent duplicate click handlers if the script is initialized again.
      if (button.dataset.themeReady === "true") return;

      button.dataset.themeReady = "true";

      button.addEventListener("click", function (event) {
        event.preventDefault();

        const current =
          document.documentElement.getAttribute("data-theme") || "light";

        const next = current === "dark" ? "light" : "dark";

        applyTheme(next, true);
      });
    });
  }

  /* ---------- TOAST ---------- */

  window.showToast = function (message) {
    const stack = document.getElementById("toast-stack");

    if (!stack) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    stack.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3200);
  };

  /* ---------- SCRIPT LOADER ---------- */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);

      if (existing) {
        if (window.pyodide || window.THREE) {
          resolve();
          return;
        }
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;

      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(script);
    });
  }

  /* ---------- PYTHON / PYODIDE ---------- */

  let pyodidePromise = null;

  async function getPyodide() {
    if (window.pyodide) {
      return window.pyodide;
    }

    if (!pyodidePromise) {
      pyodidePromise = loadScript(
        "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js"
      ).then(async () => {
        if (typeof loadPyodide !== "function") {
          throw new Error("Pyodide failed to load.");
        }

        return await loadPyodide({
          indexURL:
            "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/"
        });
      });
    }

    return await pyodidePromise;
  }

  window.runCode = async function () {
    const editor = document.getElementById("code");
    const output = document.getElementById("output");
    const runButton = document.getElementById("run-btn");

    if (!editor || !output) return;

    const code = editor.value;

    if (!code.trim()) {
      output.textContent = "Write some Python code first.";
      return;
    }

    if (runButton) {
      runButton.disabled = true;
      runButton.textContent = "Running...";
    }

    output.textContent = "Starting Python...";

    try {
      const pyodide = await getPyodide();

      pyodide.setStdout({
        batched: (text) => {
          output.textContent +=
            (output.textContent ? "\n" : "") + text;
        }
      });

      pyodide.setStderr({
        batched: (text) => {
          output.textContent +=
            (output.textContent ? "\n" : "") + text;
        }
      });

      output.textContent = "";

      await pyodide.runPythonAsync(code);

      if (!output.textContent.trim()) {
        output.textContent = "Code executed successfully.";
      }
    } catch (error) {
      output.textContent =
        error && error.message
          ? error.message
          : String(error);
    } finally {
      if (runButton) {
        runButton.disabled = false;
        runButton.textContent = "▶ Run";
      }
    }
  };

  /* ---------- MAGNETIC BUTTON ---------- */

  function initMagneticButtons() {
    const buttons = document.querySelectorAll(".magnetic");

    buttons.forEach((button) => {
      if (button.dataset.magneticReady === "true") return;

      button.dataset.magneticReady = "true";

      button.addEventListener("mousemove", (event) => {
        const rect = button.getBoundingClientRect();

        const x =
          ((event.clientX - rect.left) / rect.width - 0.5) * 10;

        const y =
          ((event.clientY - rect.top) / rect.height - 0.5) * 10;

        button.style.transform =
          `translate(${x}px, ${y}px)`;
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "";
      });
    });
  }

  /* ---------- ERROR DICTIONARY ---------- */

  function initErrorDictionary() {
    const search = document.getElementById("search");

    if (!search) return;

    window.filterErrors = function () {
      const query = search.value.trim().toLowerCase();

      const cards = document.querySelectorAll(".error-card");
      let visible = 0;

      cards.forEach((card) => {
        const text = card.textContent.toLowerCase();
        const match = !query || text.includes(query);

        card.style.display = match ? "" : "none";

        if (match) visible++;
      });

      const count = document.getElementById("count");
      if (count) {
        count.textContent =
          `${visible} error${visible === 1 ? "" : "s"} found`;
      }

      const noResults = document.getElementById("no-results");
      if (noResults) {
        noResults.style.display =
          visible === 0 ? "block" : "none";
      }
    };

    search.addEventListener("input", window.filterErrors);
    window.filterErrors();
  }

  /* ---------- CTRL + ENTER ---------- */

  function initEditorShortcut() {
    const editor = document.getElementById("code");

    if (!editor) return;

    editor.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();

        if (typeof window.runCode === "function") {
          window.runCode();
        }
      }
    });
  }

  /* ---------- THREE.JS HERO ---------- */

  let heroScene = null;

  async function initThreeHero() {
    const container = document.getElementById("canvas-wrap");

    if (!container) return;

    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    try {
      await loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
      );

      if (!window.THREE) return;

      const THREE = window.THREE;

      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        100
      );

      camera.position.set(0, 0, 6.8);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
      });

      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 2)
      );

      renderer.setSize(
        window.innerWidth,
        window.innerHeight
      );

      renderer.outputEncoding = THREE.sRGBEncoding;

      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      /* Main metallic object */
      const mainGeometry = new THREE.TorusKnotGeometry(
        1.15,
        0.32,
        180,
        32
      );

      const mainMaterial = new THREE.MeshStandardMaterial({
        color: 0xe9ebf1,
        metalness: 0.92,
        roughness: 0.22,
        emissive: 0xffffff,
        emissiveIntensity: 0.08
      });

      const mainObject = new THREE.Mesh(
        mainGeometry,
        mainMaterial
      );

      scene.add(mainObject);

      /* Central core */
      const coreGeometry = new THREE.SphereGeometry(
        0.34,
        48,
        48
      );

      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.15,
        roughness: 0.18,
        emissive: 0xffffff,
        emissiveIntensity: 0.55
      });

      const core = new THREE.Mesh(
        coreGeometry,
        coreMaterial
      );

      scene.add(core);

      /* Soft core glow */
      const glowGeometry = new THREE.SphereGeometry(
        0.49,
        32,
        32
      );

      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      const glow = new THREE.Mesh(
        glowGeometry,
        glowMaterial
      );

      scene.add(glow);

      /* Orbital rings */
      const rings = [];

      [1.7, 2.0, 2.3].forEach((radius, index) => {
        const ringGeometry =
          new THREE.TorusGeometry(
            radius,
            0.009,
            12,
            180
          );

        const ringMaterial =
          new THREE.MeshBasicMaterial({
            color:
              index === 1
                ? 0x9d88ff
                : 0xffffff,
            transparent: true,
            opacity: 0.18
          });

        const ring = new THREE.Mesh(
          ringGeometry,
          ringMaterial
        );

        ring.rotation.x =
          index === 0 ? 1.0 :
          index === 1 ? 0.65 :
          0.25;

        ring.rotation.z =
          index === 2 ? 0.7 : 0;

        scene.add(ring);
        rings.push(ring);
      });

      /* Floating particles / geometry */
      const floating = [];

      for (let i = 0; i < 9; i++) {
        const geometry =
          new THREE.OctahedronGeometry(
            0.055 + (i % 3) * 0.018
          );

        const material =
          new THREE.MeshStandardMaterial({
            color:
              i % 3 === 0
                ? 0xf2a23a
                : i % 3 === 1
                  ? 0x9d88ff
                  : 0x4dcc94,
            metalness: 0.7,
            roughness: 0.3
          });

        const mesh = new THREE.Mesh(
          geometry,
          material
        );

        const angle =
          (i / 9) * Math.PI * 2;

        const radius = 2.1 + (i % 3) * 0.45;

        mesh.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle * 1.4) * 0.65,
          Math.sin(angle) * radius * 0.35
        );

        scene.add(mesh);

        floating.push({
          mesh,
          angle,
          radius,
          speed: 0.00025 + i * 0.000025
        });
      }

      /* Lighting */
      const ambientLight =
        new THREE.AmbientLight(0xffffff, 0.48);

      const coreLight =
        new THREE.PointLight(
          0xffffff,
          2.0,
          8
        );

      const violetLight =
        new THREE.PointLight(
          0x9d88ff,
          1.1,
          10
        );

      violetLight.position.set(
        -3,
        2,
        4
      );

      const mintLight =
        new THREE.PointLight(
          0x4dcc94,
          0.7,
          9
        );

      mintLight.position.set(
        3,
        -2,
        3
      );

      scene.add(
        ambientLight,
        coreLight,
        violetLight,
        mintLight
      );

      heroScene = {
        scene,
        camera,
        renderer,
        container,
        mainObject,
        core,
        glow,
        rings,
        floating,
        ambientLight,
        coreLight,
        violetLight,
        mintLight
      };

      function updateHeroTheme(theme) {
        if (!heroScene) return;

        const dark = theme === "dark";

        if (dark) {
          mainMaterial.color.setHex(0x687080);
          mainMaterial.emissive.setHex(0x171b24);
          mainMaterial.emissiveIntensity = 0.12;

          coreMaterial.color.setHex(0x8f98ad);
          coreMaterial.emissive.setHex(0x59657d);
          coreMaterial.emissiveIntensity = 1.15;

          glowMaterial.color.setHex(0x78839b);
          glowMaterial.opacity = 0.085;

          coreLight.color.setHex(0xbfc8dc);
          coreLight.intensity = 4.2;

          ambientLight.intensity = 0.22;

          rings.forEach((ring, index) => {
            ring.material.opacity =
              index === 1 ? 0.22 : 0.11;
          });
        } else {
          mainMaterial.color.setHex(0xe9ebf1);
          mainMaterial.emissive.setHex(0xffffff);
          mainMaterial.emissiveIntensity = 0.08;

          coreMaterial.color.setHex(0xffffff);
          coreMaterial.emissive.setHex(0xffffff);
          coreMaterial.emissiveIntensity = 0.55;

          glowMaterial.color.setHex(0xffffff);
          glowMaterial.opacity = 0.055;

          coreLight.color.setHex(0xffffff);
          coreLight.intensity = 2.0;

          ambientLight.intensity = 0.48;

          rings.forEach((ring, index) => {
            ring.material.opacity =
              index === 1 ? 0.18 : 0.12;
          });
        }
      }

      updateHeroTheme(
        document.documentElement.getAttribute("data-theme") ||
        "light"
      );

      window.addEventListener(
        "pystart-theme-change",
        (event) => {
          updateHeroTheme(
            event.detail && event.detail.theme
              ? event.detail.theme
              : "light"
          );
        }
      );

      let mouseX = 0;
      let mouseY = 0;
      let targetX = 0;
      let targetY = 0;

      window.addEventListener(
        "mousemove",
        (event) => {
          targetX =
            (event.clientX / window.innerWidth - 0.5) *
            0.35;

          targetY =
            (event.clientY / window.innerHeight - 0.5) *
            0.25;
        },
        { passive: true }
      );

      window.addEventListener("resize", () => {
        camera.aspect =
          window.innerWidth /
          window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
          window.innerWidth,
          window.innerHeight
        );

        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, 2)
        );
      });

      const clock = new THREE.Clock();

      function animate() {
        requestAnimationFrame(animate);

        const elapsed = clock.getElapsedTime();

        mouseX +=
          (targetX - mouseX) * 0.035;

        mouseY +=
          (targetY - mouseY) * 0.035;

        mainObject.rotation.x =
          elapsed * 0.12 + mouseY;

        mainObject.rotation.y =
          elapsed * 0.18 + mouseX;

        core.rotation.y =
          elapsed * 0.35;

        glow.scale.setScalar(
          1 + Math.sin(elapsed * 1.8) * 0.06
        );

        rings.forEach((ring, index) => {
          ring.rotation.z +=
            0.0009 * (index + 1);
        });

        floating.forEach((item, index) => {
          const a =
            item.angle +
            elapsed * item.speed * 1000;

          item.mesh.position.y +=
            Math.sin(elapsed * 0.7 + index) *
            0.0006;

          item.mesh.rotation.x += 0.004;
          item.mesh.rotation.y += 0.005;

          item.mesh.position.x =
            Math.cos(a) * item.radius;

          item.mesh.position.z =
            Math.sin(a) * item.radius * 0.35;
        });

        camera.position.x +=
          (mouseX * 0.7 - camera.position.x) *
          0.025;

        camera.position.y +=
          (-mouseY * 0.7 - camera.position.y) *
          0.025;

        camera.lookAt(0, 0, 0);

        renderer.render(
          scene,
          camera
        );
      }

      animate();
    } catch (error) {
      console.error(
        "PyStart 3D background failed:",
        error
      );
    }
  }


  /* ---------- TO-DO PROJECT ---------- */

  function initTodoProject() {
    const form = document.getElementById("todo-form");
    const input = document.getElementById("todo-input");
    const list = document.getElementById("todo-list");
    const empty = document.getElementById("todo-empty");
    const count = document.getElementById("todo-count");
    const clearCompleted = document.getElementById("clear-completed");

    if (!form || !input || !list) return;

    const STORAGE_KEY = "pystart-todo-tasks";
    let activeFilter = "all";
    let tasks = [];

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      tasks = Array.isArray(saved) ? saved : [];
    } catch (error) {
      tasks = [];
    }

    function save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }

    function updateCount() {
      const active = tasks.filter(task => !task.completed).length;
      count.textContent =
        `${active} active task${active === 1 ? "" : "s"} · ${tasks.length} total`;
    }

    function visibleTasks() {
      if (activeFilter === "active") {
        return tasks.filter(task => !task.completed);
      }

      if (activeFilter === "completed") {
        return tasks.filter(task => task.completed);
      }

      return tasks;
    }

    function render() {
      list.innerHTML = "";

      const visible = visibleTasks();

      visible.forEach(task => {
        const item = document.createElement("div");
        item.className = "todo-item" + (task.completed ? " completed" : "");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "todo-check";
        checkbox.checked = task.completed;
        checkbox.setAttribute("aria-label", `Complete ${task.text}`);

        checkbox.addEventListener("change", () => {
          task.completed = checkbox.checked;
          save();
          render();
        });

        const text = document.createElement("div");
        text.className = "todo-text";
        text.textContent = task.text;

        const actions = document.createElement("div");
        actions.className = "todo-actions";

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "todo-action";
        edit.textContent = "Edit";

        edit.addEventListener("click", () => {
          const updated = window.prompt("Edit task:", task.text);
          if (updated === null) return;

          const clean = updated.trim();

          if (!clean) {
            if (window.showToast) window.showToast("Task cannot be empty.");
            return;
          }

          task.text = clean;
          save();
          render();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "todo-action delete";
        remove.textContent = "Delete";

        remove.addEventListener("click", () => {
          tasks = tasks.filter(item => item.id !== task.id);
          save();
          render();
          if (window.showToast) window.showToast("Task deleted.");
        });

        actions.append(edit, remove);
        item.append(checkbox, text, actions);
        list.appendChild(item);
      });

      empty.style.display = visible.length ? "none" : "block";
      updateCount();
    }

    form.addEventListener("submit", event => {
      event.preventDefault();

      const text = input.value.trim();

      if (!text) {
        if (window.showToast) window.showToast("Write a task first.");
        input.focus();
        return;
      }

      tasks.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        text,
        completed: false
      });

      save();
      input.value = "";
      render();
      input.focus();
    });

    document.querySelectorAll(".todo-filter").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".todo-filter")
          .forEach(item => item.classList.remove("active"));

        button.classList.add("active");
        activeFilter = button.dataset.filter || "all";
        render();
      });
    });

    if (clearCompleted) {
      clearCompleted.addEventListener("click", () => {
        const before = tasks.length;
        tasks = tasks.filter(task => !task.completed);

        if (tasks.length !== before && window.showToast) {
          window.showToast("Completed tasks cleared.");
        }

        save();
        render();
      });
    }

    render();
  }


  /* ---------- NUMBER GUESSING GAME ---------- */

  function initNumberGuessingGame() {
    const form = document.getElementById("guess-form");
    const input = document.getElementById("guess-input");
    const submit = document.getElementById("guess-submit");
    const feedback = document.getElementById("guess-feedback-message");
    const attemptsEl = document.getElementById("guess-attempts");
    const bestEl = document.getElementById("guess-best");
    const historyEl = document.getElementById("guess-history-list");
    const resetButton = document.getElementById("guess-reset");
    const newGameButton = document.getElementById("guess-new");

    if (!form || !input || !submit || !feedback) return;

    const BEST_KEY = "pystart-number-guess-best";
    let secretNumber = 0;
    let attempts = 0;
    let history = [];
    let gameOver = false;

    function getBest() {
      const value = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? value : null;
    }

    function renderHistory() {
      historyEl.innerHTML = "";

      if (!history.length) {
        const empty = document.createElement("span");
        empty.className = "muted";
        empty.textContent = "Your guesses will appear here.";
        empty.style.fontSize = ".75rem";
        historyEl.appendChild(empty);
        return;
      }

      history.forEach(number => {
        const item = document.createElement("span");
        item.className = "guess-number";
        item.textContent = number;
        historyEl.appendChild(item);
      });
    }

    function startGame() {
      secretNumber = Math.floor(Math.random() * 100) + 1;
      attempts = 0;
      history = [];
      gameOver = false;

      input.disabled = false;
      submit.disabled = false;
      input.value = "";

      attemptsEl.textContent = "0";
      bestEl.textContent = getBest() || "—";

      feedback.textContent =
        "I'm thinking of a number between 1 and 100.";
      feedback.className = "guess-feedback-message";

      renderHistory();
      input.focus();
    }

    function finishGame() {
      gameOver = true;
      input.disabled = true;
      submit.disabled = true;

      const oldBest = getBest();

      if (!oldBest || attempts < oldBest) {
        localStorage.setItem(BEST_KEY, String(attempts));
        bestEl.textContent = String(attempts);

        if (typeof window.showToast === "function") {
          window.showToast("New best score!");
        }
      }
    }

    form.addEventListener("submit", event => {
      event.preventDefault();

      if (gameOver) return;

      const guess = Number(input.value);

      if (!Number.isInteger(guess) || guess < 1 || guess > 100) {
        feedback.textContent =
          "Enter a whole number from 1 to 100.";
        feedback.className = "guess-feedback-message error";
        input.focus();
        return;
      }

      attempts += 1;
      attemptsEl.textContent = String(attempts);

      history.push(guess);
      renderHistory();

      if (guess === secretNumber) {
        feedback.textContent =
          `Correct! You found it in ${attempts} attempt${attempts === 1 ? "" : "s"}.`;
        feedback.className = "guess-feedback-message correct";
        finishGame();
        return;
      }

      if (guess < secretNumber) {
        feedback.textContent = "Too low — try a higher number.";
        feedback.className = "guess-feedback-message low";
      } else {
        feedback.textContent = "Too high — try a lower number.";
        feedback.className = "guess-feedback-message high";
      }

      input.value = "";
      input.focus();
    });

    resetButton.addEventListener("click", startGame);
    newGameButton.addEventListener("click", startGame);

    startGame();
  }

  /* ---------- START ---------- */

  function init() {
    initTheme();
    initMagneticButtons();
    initErrorDictionary();
    initEditorShortcut();
    initTodoProject();
    initNumberGuessingGame();
    initThreeHero();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }

})();
