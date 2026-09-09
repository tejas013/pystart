(() => {
  "use strict";

  const root = document.documentElement;

  // Apply saved theme before the page is fully painted.
  const savedTheme = localStorage.getItem("pystart-theme");
  if (savedTheme === "dark" || savedTheme === "light") {
    root.setAttribute("data-theme", savedTheme);
  } else {
    root.setAttribute("data-theme", "light");
  }

  function updateThemeButton() {
    const button = document.getElementById("theme-toggle");
    if (!button) return;

    const dark = root.getAttribute("data-theme") === "dark";
    const icon = button.querySelector(".theme-icon");
    const label = button.querySelector(".theme-label");

    if (icon) icon.textContent = dark ? "☀" : "☾";
    if (label) label.textContent = dark ? "Light" : "Dark";
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    button.title = dark ? "Switch to light mode" : "Switch to dark mode";
  }

  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("pystart-theme", theme);
    updateThemeButton();

    window.dispatchEvent(
      new CustomEvent("pystart-theme-change", { detail: { theme } })
    );
  }

  window.showToast = function(message) {
    let toast = document.getElementById("pystart-toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "pystart-toast";
      Object.assign(toast.style, {
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
        font: "600 12px Sora, sans-serif",
        opacity: "0",
        transform: "translateY(8px)",
        transition: "all .2s ease"
      });
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    clearTimeout(window.__pystartToast);
    window.__pystartToast = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
    }, 2200);
  };

  function initTheme() {
    updateThemeButton();

    const button = document.getElementById("theme-toggle");
    if (!button) return;

    button.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (src.includes("pyodide") && window.loadPyodide) return resolve();
        if (src.includes("three") && window.THREE) return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ---------- Browser Python runner ----------
  let pyodidePromise = null;

  async function getPyodide() {
    if (!pyodidePromise) {
      await loadScript("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");
      pyodidePromise = window.loadPyodide();
    }
    return pyodidePromise;
  }

  window.runCode = async function() {
    const editor = document.getElementById("code");
    const output = document.getElementById("output");
    const button = document.getElementById("run-btn");

    if (!editor || !output) return;

    const originalText = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.textContent = "Loading...";
    }

    output.textContent = "Loading Python...";

    try {
      const pyodide = await getPyodide();

      pyodide.runPython(`
import sys, io
sys.stdout = io.StringIO()
`);

      pyodide.runPython(editor.value);

      const result = pyodide.runPython("sys.stdout.getvalue()");
      output.textContent = result || "(No output — use print())";

      if (window.showToast) window.showToast("Code ran successfully");
    } catch (error) {
      output.textContent = "Error:\\n" + (error?.message || String(error));
      if (window.showToast) window.showToast("There is an error in your code");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText || "Run Code";
      }
    }
  };

  function initMagneticButtons() {
    document.querySelectorAll(".magnetic").forEach((element) => {
      element.addEventListener("mousemove", (event) => {
        const rect = element.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 7;
        element.style.transform = `translate(${x}px, ${y}px)`;
      });

      element.addEventListener("mouseleave", () => {
        element.style.transform = "";
      });
    });
  }

  // ---------- Error Dictionary ----------
  window.filterErrors = function() {
    const search = document.getElementById("search");
    if (!search) return;

    const query = search.value.trim().toLowerCase();
    const cards = document.querySelectorAll(".error-card");
    let visible = 0;

    cards.forEach((card) => {
      const match = card.textContent.toLowerCase().includes(query);
      card.style.display = match ? "" : "none";
      if (match) visible++;
    });

    const noResults = document.getElementById("no-results");
    if (noResults) noResults.style.display = visible ? "none" : "block";
  };

  function initErrorDictionary() {
    const search = document.getElementById("search");
    if (search) search.addEventListener("input", window.filterErrors);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initMagneticButtons();
    initErrorDictionary();
  });
})();
