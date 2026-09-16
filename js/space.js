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
  const state = {
    records: [], visible: [], selected: null, globe: null,
    running: true, group: 'STATIONS', rendered: [],
    dependenciesReady: false, destroyed: false
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
    el.innerHTML = `<span class="pulse" style="background:${ok ? '#00e5c3' : '#ff4b62'};box-shadow:0 0 13px ${ok ? '#00e5c3' : '#ff4b62'}"></span><span>${esc(text)}</span>`;
  }

  function setImageStatus(text) {
    const el = $('image-date');
    if (el) el.textContent = text;
  }

  async function loadDependencies() {
    // The old UMD build can fail on some GitHub Pages/browser combinations.
    // Use browser ESM as a reliable fallback, without changing the rest of the app.
    if (!window.satellite) {
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/satellite.js@7.1.0/+esm');
        window.satellite = mod.default || mod;
      } catch (err) {
        console.error('satellite.js ESM load failed', err);
      }
    }

    if (typeof window.Globe !== 'function') {
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/+esm');
        window.Globe = mod.default || mod.Globe || mod;
      } catch (err) {
        console.error('globe.gl ESM load failed', err);
      }
    }

    state.dependenciesReady = !!window.satellite && typeof window.Globe === 'function';
    return state.dependenciesReady;
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
    } catch (e) {
      return null;
    }
  }

  function dataAge(record) {
    const epochYear = Number(record.satrec?.epochyr);
    const epochDays = Number(record.satrec?.epochdays);
    if (!Number.isFinite(epochYear) || !Number.isFinite(epochDays)) return 'CURRENT';
    const fullYear = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
    const epoch = new Date(Date.UTC(fullYear, 0, 1));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(epochDays) - 1);
    epoch.setUTCHours((epochDays % 1) * 24, 0, 0, 0);
    const hours = Math.max(0, (Date.now() - epoch.getTime()) / 36e5);
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  }

  function buildGlobe() {
    if (typeof window.Globe !== 'function') {
      setStatus('3D GLOBE ENGINE FAILED', false);
      return false;
    }
    const el = $('globe');
    if (!el) return false;

    try {
      state.globe = window.Globe(el, { waitForGlobeReady: true, animateIn: true })
        .globeImageUrl(STATIC_EARTH)
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#00d9bc')
        .atmosphereAltitude(0.12)
        .showGraticules(true)
        .graticuleColor(() => 'rgba(0,229,195,.08)')
        .pointLat('lat')
        .pointLng('lng')
        .pointAltitude(d => Math.min(0.42, Math.max(0.035, (d.alt || 400) / 6371)))
        .pointRadius(d => d.selected ? 0.055 : 0.022)
        .pointColor(d => d.selected ? '#ffad42' : '#00e5c3')
        .pointsMerge(true)
        .onPointClick(d => selectRecord(d.record?.norad));

      const controls = state.globe.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.18;
      controls.enablePan = false;
      controls.enableDamping = true;

      const resize = () => {
        if (!state.globe || !el.clientWidth) return;
        state.globe.width(el.clientWidth).height(el.clientHeight);
      };
      window.addEventListener('resize', resize, { passive: true });
      resize();
      return true;
    } catch (err) {
      console.error('Globe initialization failed', err);
      setStatus('3D GLOBE INIT FAILED', false);
      return false;
    }
  }

  function updateGlobe() {
    if (!state.globe || !window.satellite || !state.visible.length) return;
    const now = new Date();
    const pts = [];
    for (const r of state.visible.slice(0, MAX_RENDER)) {
      const p = propagate(r, now);
      if (p) pts.push({ ...p, record: r, selected: state.selected?.norad === r.norad });
    }
    state.rendered = pts;
    state.globe.pointsData(pts);
    $('tracked-count').textContent = pts.length.toLocaleString();
    if (state.selected) {
      const p = propagate(state.selected, now);
      if (p) updateSelectedTelemetry(p);
    }
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
    const items = state.visible.slice(0, 160);
    list.innerHTML = items.map(r => `
      <button class="sat-item ${state.selected?.norad === r.norad ? 'selected' : ''}" data-norad="${r.norad}" type="button">
        <span><strong>${esc(r.name)}</strong><small>NORAD ${r.norad} · ${esc(groups[state.group] || 'Catalog')}</small></span>
        <em>TRACK</em>
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
      if (state.globe) state.globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: 2.1 }, 900);
    }
    updateGlobe();
  }

  function filter() {
    const q = $('sat-search').value.trim().toLowerCase();
    state.visible = state.records.filter(r => !q || r.name.toLowerCase().includes(q) || String(r.norad).includes(q));
    renderList();
    updateGlobe();
  }

  async function loadGroup() {
    const group = $('group-select').value;
    state.group = group;
    setStatus('FETCHING ORBITAL ELEMENTS');
    $('load-group').disabled = true;
    $('refresh-data').disabled = true;
    try {
      // CelesTrak supports GROUP + FORMAT=TLE queries. Avoid unsupported MAX parameters.
      const url = `${CATALOG_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=TLE`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
      const raw = await res.text();
      const records = parseTLE(raw);
      if (!records.length) throw new Error('No orbital elements returned');
      state.records = records;
      state.visible = records;
      $('catalog-count').textContent = records.length.toLocaleString();
      $('data-age').textContent = dataAge(records[0]);
      setStatus(`CATALOG ONLINE · ${groups[group]}`);
      renderList();
      if (!state.selected || !records.some(x => x.norad === state.selected.norad)) {
        selectRecord(records[0].norad);
      } else {
        selectRecord(state.selected.norad);
      }
    } catch (err) {
      console.error(err);
      setStatus('CATALOG REQUEST FAILED', false);
      $('sat-list').innerHTML = `<div class="empty-list">Live catalog could not be loaded.<br><br>${esc(err.message)}<br><br>Try Refresh.</div>`;
      $('catalog-count').textContent = '—';
      $('tracked-count').textContent = '—';
    } finally {
      $('load-group').disabled = false;
      $('refresh-data').disabled = false;
    }
  }

  function observationUrl(date) {
    const params = new URLSearchParams({
      SERVICE:'WMS', REQUEST:'GetMap', VERSION:'1.3.0',
      LAYERS:'MODIS_Terra_CorrectedReflectance_TrueColor',
      CRS:'EPSG:4326', BBOX:'-180,-90,180,90', WIDTH:'1200', HEIGHT:'600',
      FORMAT:'image/jpeg', STYLES:'', TIME:date
    });
    return `${NASA_WMS}?${params.toString()}`;
  }

  function setObservation() {
    const img = $('earth-image');
    if (!img) return;
    const today = new Date();
    const dates = [0, 1, 2, 3].map(days => new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10));
    let index = 0;
    const tryNext = () => {
      if (index >= dates.length) {
        img.src = STATIC_EARTH;
        setImageStatus('STATIC EARTH FALLBACK · NASA FEED UNAVAILABLE');
        return;
      }
      const date = dates[index++];
      setImageStatus(`${date} · MODIS TERRA`);
      img.onload = () => setImageStatus(`${date} · MODIS TERRA · ONLINE`);
      img.onerror = tryNext;
      img.src = observationUrl(date);
    };
    tryNext();
  }

  function wire() {
    $('load-group').addEventListener('click', loadGroup);
    $('refresh-data').addEventListener('click', loadGroup);
    $('sat-search').addEventListener('input', filter);
    $('search-clear').addEventListener('click', () => {
      $('sat-search').value = '';
      filter();
      $('sat-search').focus();
    });
    $('auto-rotate').addEventListener('click', () => {
      state.running = !state.running;
      if (state.globe) state.globe.controls().autoRotate = state.running;
      $('auto-rotate').classList.toggle('active', state.running);
      $('auto-rotate').textContent = state.running ? 'AUTO ROTATE' : 'ROTATION PAUSED';
    });
    $('reset-view').addEventListener('click', () => state.globe?.pointOfView({ lat: 20, lng: 0, altitude: 2.4 }, 800));
  }

  function tick() {
    if (state.destroyed) return;
    updateGlobe();
    setTimeout(() => requestAnimationFrame(tick), 1000);
  }

  async function init() {
    setStatus('LOADING 3D ENGINE');
    const ready = await loadDependencies();
    if (!ready) {
      setStatus('LIBRARY LOAD FAILED · CHECK CDN', false);
      return;
    }
    buildGlobe();
    wire();
    setObservation();
    await loadGroup();
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
