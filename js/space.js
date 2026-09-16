(() => {
  'use strict';

  const CATALOG_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
  const NASA_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
  const STATIC_EARTH = 'https://cdn.jsdelivr.net/npm/three-globe@2.46.2/example/img/earth-night.jpg';
  const groups = {
    STATIONS: 'Space Stations',
    STARLINK: 'Starlink',
    GNSS: 'GNSS / Navigation',
    WEATHER: 'Weather / Earth Resources',
    ACTIVE: 'Active Satellites'
  };
  const MAX_RENDER = 650;
  const EARTH_R = 2.4;
  const state = {
    records: [], visible: [], selected: null,
    scene: null, camera: null, renderer: null, controls: null,
    earth: null, satPoints: null, satData: [], selectedMesh: null,
    orbitLine: null, raycaster: null, pointer: null,
    running: true, group: 'STATIONS', rendered: [],
    threeReady: false, destroyed: false, resizeHandler: null, raf: 0
  };
  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[m]));
  }

  function setStatus(text, ok = true) {
    const el = $('data-status');
    if (!el) return;
    const color = ok ? '#00e5c3' : '#ff4b62';
    el.innerHTML = `<span class="pulse" style="background:${color};box-shadow:0 0 13px ${color}"></span><span>${esc(text)}</span>`;
  }

  function setImageStatus(text) {
    const el = $('image-date');
    if (el) el.textContent = text;
  }

  async function loadDependencies() {
    if (!window.satellite) {
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/satellite.js@7.1.0/+esm');
        window.satellite = mod.default || mod;
      } catch (err) {
        console.error('satellite.js load failed', err);
      }
    }
    try {
      const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js');
      const controlsMod = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js');
      state.THREE = THREE;
      state.OrbitControls = controlsMod.OrbitControls;
      state.threeReady = true;
    } catch (err) {
      console.error('Three.js load failed', err);
      state.threeReady = false;
    }
    return !!window.satellite && state.threeReady;
  }

  function parseTLE(raw) {
    const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length;) {
      let name = '', l1 = '', l2 = '';
      if (lines[i].startsWith('1 ')) {
        l1 = lines[i]; l2 = lines[i + 1] || ''; i += 2;
      } else {
        name = lines[i].replace(/^0\s+/, '');
        l1 = lines[i + 1] || ''; l2 = lines[i + 2] || ''; i += 3;
      }
      if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
      const norad = Number(l1.slice(2, 7).trim());
      if (!Number.isFinite(norad)) continue;
      try {
        const satrec = window.satellite.twoline2satrec(l1, l2);
        out.push({ name: name || `OBJECT ${norad}`, norad, l1, l2, satrec });
      } catch (e) {
        console.warn('Skipped invalid TLE', norad, e);
      }
    }
    return out;
  }

  function propagate(record, date = new Date()) {
    try {
      const pv = window.satellite.propagate(record.satrec, date);
      const pos = pv.position, vel = pv.velocity;
      if (!pos || !vel || !Number.isFinite(pos.x)) return null;
      const gmst = window.satellite.gstime(date);
      const geo = window.satellite.eciToGeodetic(pos, gmst);
      const lat = window.satellite.degreesLat(geo.latitude);
      const lng = window.satellite.degreesLong(geo.longitude);
      const alt = Number(geo.height);
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      if (![lat, lng, alt, speed].every(Number.isFinite)) return null;
      return { lat, lng, alt, speed };
    } catch (e) { return null; }
  }

  function dataAge(record) {
    const epochYear = Number(record.satrec?.epochyr);
    const epochDays = Number(record.satrec?.epochdays);
    if (!Number.isFinite(epochYear) || !Number.isFinite(epochDays)) return 'CURRENT';
    const fullYear = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
    const epoch = new Date(Date.UTC(fullYear, 0, 1));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(epochDays) - 1);
    epoch.setUTCHours(0, 0, 0, 0);
    epoch.setTime(epoch.getTime() + (epochDays % 1) * 86400000);
    const hours = Math.max(0, (Date.now() - epoch.getTime()) / 36e5);
    return hours < 24 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
  }

  function geoToVec3(lat, lng, alt = 400) {
    const r = EARTH_R * (1 + Math.max(-0.1, alt) / 6371);
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return {
      x: -r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.cos(phi),
      z: r * Math.sin(phi) * Math.sin(theta)
    };
  }

  function makeLineCircle(THREE, radius, points, plane, material) {
    const pts = [];
    for (let i = 0; i <= points; i++) {
      const a = i / points * Math.PI * 2;
      if (plane === 'lat') pts.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)));
      else pts.push(new THREE.Vector3(radius * Math.cos(a), radius * Math.sin(a), 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineLoop(geo, material);
  }

  function addGraticule(THREE, earth) {
    const mat = new THREE.LineBasicMaterial({ color: 0x00cdb5, transparent: true, opacity: 0.13 });
    for (let lat = -60; lat <= 60; lat += 20) {
      const ring = makeLineCircle(THREE, EARTH_R * Math.cos(lat * Math.PI / 180), 96, 'lat', mat);
      ring.position.y = EARTH_R * Math.sin(lat * Math.PI / 180);
      earth.add(ring);
    }
    for (let i = 0; i < 12; i++) {
      const ring = makeLineCircle(THREE, EARTH_R, 96, 'lng', mat);
      ring.rotation.y = i * Math.PI / 12;
      earth.add(ring);
    }
  }

  function buildGlobe() {
    const THREE = state.THREE;
    const el = $('globe');
    if (!el || !THREE || !state.OrbitControls) return false;
    try {
      const width = Math.max(280, el.clientWidth || 700);
      const height = Math.max(360, el.clientHeight || 650);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x010608);

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 0.7, 7.2);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-label', 'Interactive 3D Earth and satellite visualization');
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      el.innerHTML = '';
      el.appendChild(renderer.domElement);

      const controls = new state.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.055;
      controls.minDistance = 4.2;
      controls.maxDistance = 12;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.25;
      controls.target.set(0, 0, 0);

      scene.add(new THREE.AmbientLight(0x7ddfd4, 1.15));
      const key = new THREE.DirectionalLight(0xffffff, 1.8);
      key.position.set(5, 3, 6);
      scene.add(key);
      const rim = new THREE.PointLight(0x00d9bc, 8, 14);
      rim.position.set(-4, 2, -4);
      scene.add(rim);

      const earthGroup = new THREE.Group();
      const earthMat = new THREE.MeshPhongMaterial({ color: 0x06343a, emissive: 0x002427, emissiveIntensity: 0.65, shininess: 12 });
      const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 48), earthMat);
      earthGroup.add(earth);
      const wire = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_R * 1.002, 32, 24),
        new THREE.MeshBasicMaterial({ color: 0x00cdb5, wireframe: true, transparent: true, opacity: 0.08 })
      );
      earthGroup.add(wire);
      addGraticule(THREE, earthGroup);
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_R * 1.07, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0x00e5c3, transparent: true, opacity: 0.055, side: THREE.BackSide, blending: THREE.AdditiveBlending })
      );
      earthGroup.add(atmosphere);
      scene.add(earthGroup);

      const satPoints = new THREE.Points(
        new THREE.BufferGeometry(),
        new THREE.PointsMaterial({ color: 0x00e5c3, size: 0.075, sizeAttenuation: true, transparent: true, opacity: 0.95 })
      );
      scene.add(satPoints);

      const selectedMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.105, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffad42 })
      );
      selectedMesh.visible = false;
      scene.add(selectedMesh);

      const raycaster = new THREE.Raycaster();
      raycaster.params.Points.threshold = 0.13;
      const pointer = new THREE.Vector2();
      renderer.domElement.addEventListener('pointerdown', e => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(satPoints);
        if (hits.length && hits[0].index != null) {
          const hit = state.satData[hits[0].index];
          if (hit?.record) selectRecord(hit.record.norad);
        }
      }, { passive: true });

      state.scene = scene; state.camera = camera; state.renderer = renderer;
      state.controls = controls; state.earth = earthGroup; state.satPoints = satPoints;
      state.selectedMesh = selectedMesh; state.raycaster = raycaster; state.pointer = pointer;

      state.resizeHandler = () => {
        const w = Math.max(280, el.clientWidth || 700);
        const h = Math.max(320, el.clientHeight || 650);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      window.addEventListener('resize', state.resizeHandler, { passive: true });
      state.resizeHandler();

      const animate = () => {
        if (state.destroyed) return;
        state.raf = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
      return true;
    } catch (err) {
      console.error('Three.js globe initialization failed', err);
      setStatus('3D GLOBE INIT FAILED', false);
      return false;
    }
  }

  function updateGlobe() {
    if (!state.satPoints || !window.satellite || !state.visible.length) return;
    const THREE = state.THREE;
    const now = new Date();
    const positions = [];
    const rendered = [];
    for (const r of state.visible.slice(0, MAX_RENDER)) {
      const p = propagate(r, now);
      if (!p) continue;
      const v = geoToVec3(p.lat, p.lng, p.alt);
      positions.push(v.x, v.y, v.z);
      rendered.push({ ...p, record: r, selected: state.selected?.norad === r.norad });
    }
    state.rendered = rendered;
    state.satData = rendered;
    const arr = new Float32Array(positions);
    state.satPoints.geometry.dispose();
    state.satPoints.geometry = new THREE.BufferGeometry();
    state.satPoints.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    state.satPoints.geometry.computeBoundingSphere();
    $('tracked-count').textContent = rendered.length.toLocaleString();

    if (state.selected) {
      const p = propagate(state.selected, now);
      if (p) {
        updateSelectedTelemetry(p);
        const v = geoToVec3(p.lat, p.lng, p.alt);
        state.selectedMesh.position.set(v.x, v.y, v.z);
        state.selectedMesh.visible = true;
      }
    } else state.selectedMesh.visible = false;
  }

  function updateSelectedTelemetry(p) {
    $('selected-lat').textContent = `${p.lat.toFixed(2)}°`;
    $('selected-lng').textContent = `${p.lng.toFixed(2)}°`;
    $('selected-alt').textContent = `${p.alt.toFixed(0)} km`;
    $('selected-velocity').textContent = `${p.speed.toFixed(2)} km/s`;
    $('altitude-kpi').textContent = `${p.alt.toFixed(0)} km`;
    const meanMotion = Number(state.selected?.satrec?.no);
    const period = meanMotion > 0 ? 2 * Math.PI / meanMotion : 0;
    $('selected-period').textContent = period ? `${period.toFixed(1)} min` : '—';
    const progress = (Date.now() / 60000) % 100;
    $('track-progress').style.width = `${20 + (progress % 80)}%`;
    $('ground-track').textContent = `${p.lat.toFixed(1)}°, ${p.lng.toFixed(1)}°`;
    $('selected-badge').textContent = 'TRACKING';
    $('selected-badge').classList.add('live');
    updateOrbitVisual(p);
  }

  function updateOrbitVisual(p) {
    const sat = $('orbit-sat');
    if (!sat) return;
    const angle = Math.atan2(p.lng, p.lat) * 180 / Math.PI + 180;
    sat.style.transform = `rotate(${angle}deg)`;
  }

  function renderList() {
    const list = $('sat-list');
    $('visible-count').textContent = state.visible.length.toLocaleString();
    if (!state.visible.length) {
      list.innerHTML = '<div class="empty-list">No objects match this search.</div>';
      return;
    }
    list.innerHTML = state.visible.slice(0, 160).map(r => `
      <button class="sat-item ${state.selected?.norad === r.norad ? 'selected' : ''}" data-norad="${r.norad}" type="button">
        <span><strong>${esc(r.name)}</strong><small>NORAD ${r.norad} · ${esc(groups[state.group] || 'Catalog')}</small></span><em>TRACK</em>
      </button>`).join('');
    list.querySelectorAll('.sat-item').forEach(b => b.addEventListener('click', () => selectRecord(Number(b.dataset.norad))));
  }

  function selectRecord(norad) {
    const r = state.records.find(x => x.norad === norad);
    if (!r) return;
    state.selected = r;
    $('selected-name').textContent = r.name.toUpperCase();
    $('selected-norad').textContent = String(r.norad);
    $('data-age').textContent = dataAge(r);
    renderList();
    const p = propagate(r);
    if (p) {
      updateSelectedTelemetry(p);
      if (state.controls) {
        state.controls.target.set(0, 0, 0);
        const v = geoToVec3(p.lat, p.lng, p.alt);
        state.controls.autoRotate = false;
        state.controls.target.set(v.x * 0.18, v.y * 0.18, v.z * 0.18);
      }
    }
    updateGlobe();
  }

  function filter() {
    const q = $('sat-search').value.trim().toLowerCase();
    state.visible = state.records.filter(r => !q || r.name.toLowerCase().includes(q) || String(r.norad).includes(q));
    renderList(); updateGlobe();
  }

  async function loadGroup() {
    const group = $('group-select').value;
    state.group = group;
    setStatus('FETCHING ORBITAL ELEMENTS');
    $('load-group').disabled = true; $('refresh-data').disabled = true;
    try {
      const url = `${CATALOG_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=TLE`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
      const raw = await res.text();
      const records = parseTLE(raw);
      if (!records.length) throw new Error('No orbital elements returned');
      state.records = records; state.visible = records;
      $('catalog-count').textContent = records.length.toLocaleString();
      $('data-age').textContent = dataAge(records[0]);
      setStatus(`CATALOG ONLINE · ${groups[group]}`);
      renderList();
      if (!state.selected || !records.some(x => x.norad === state.selected.norad)) selectRecord(records[0].norad);
      else selectRecord(state.selected.norad);
    } catch (err) {
      console.error(err); setStatus('CATALOG REQUEST FAILED', false);
      $('sat-list').innerHTML = `<div class="empty-list">Live catalog could not be loaded.<br><br>${esc(err.message)}<br><br>Try Refresh.</div>`;
      $('catalog-count').textContent = '—'; $('tracked-count').textContent = '—';
    } finally {
      $('load-group').disabled = false; $('refresh-data').disabled = false;
    }
  }

  function observationUrl(date) {
    const params = new URLSearchParams({SERVICE:'WMS',REQUEST:'GetMap',VERSION:'1.3.0',LAYERS:'MODIS_Terra_CorrectedReflectance_TrueColor',CRS:'EPSG:4326',BBOX:'-180,-90,180,90',WIDTH:'1200',HEIGHT:'600',FORMAT:'image/jpeg',STYLES:'',TIME:date});
    return `${NASA_WMS}?${params.toString()}`;
  }

  function setObservation() {
    const img = $('earth-image'); if (!img) return;
    const today = new Date();
    const dates = [0,1,2,3].map(days => new Date(today.getTime() - days * 86400000).toISOString().slice(0,10));
    let index = 0;
    const tryNext = () => {
      if (index >= dates.length) { img.src = STATIC_EARTH; setImageStatus('STATIC EARTH FALLBACK · NASA FEED UNAVAILABLE'); return; }
      const date = dates[index++]; setImageStatus(`${date} · MODIS TERRA`);
      img.onload = () => setImageStatus(`${date} · MODIS TERRA · ONLINE`);
      img.onerror = tryNext; img.src = observationUrl(date);
    };
    tryNext();
  }

  function wire() {
    $('load-group').addEventListener('click', loadGroup); $('refresh-data').addEventListener('click', loadGroup);
    $('sat-search').addEventListener('input', filter);
    $('search-clear').addEventListener('click', () => { $('sat-search').value=''; filter(); $('sat-search').focus(); });
    $('auto-rotate').addEventListener('click', () => {
      state.running = !state.running;
      if (state.controls) state.controls.autoRotate = state.running;
      $('auto-rotate').classList.toggle('active', state.running);
      $('auto-rotate').textContent = state.running ? 'AUTO ROTATE' : 'ROTATION PAUSED';
    });
    $('reset-view').addEventListener('click', () => {
      if (!state.camera || !state.controls) return;
      state.camera.position.set(0, 0.7, 7.2); state.controls.target.set(0,0,0); state.controls.autoRotate = state.running;
      state.controls.update();
    });
  }

  function tick() {
    if (state.destroyed) return;
    updateGlobe();
    setTimeout(() => requestAnimationFrame(tick), 1000);
  }

  async function init() {
    setStatus('LOADING 3D ENGINE');
    const ready = await loadDependencies();
    if (!ready) { setStatus('3D ENGINE LOAD FAILED · CHECK CDN', false); return; }
    if (!buildGlobe()) return;
    wire(); setObservation(); await loadGroup(); tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
