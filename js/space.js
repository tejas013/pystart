(() => {
  'use strict';

  const CATALOG_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
  const NASA_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
  const BLUE_MARBLE = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg';
  const TOPOLOGY = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png';
  const STATIC_EARTH = BLUE_MARBLE;
  const groups = {
    STATIONS: 'Space Stations', STARLINK: 'Starlink', GNSS: 'GNSS / Navigation',
    WEATHER: 'Weather / Earth Resources', ACTIVE: 'Active Satellites'
  };
  const MAX_RENDER = 650;
  const MAX_MODELS = 120;
  const EARTH_R = 2.4;
  const state = {
    records: [], visible: [], selected: null,
    THREE: null, OrbitControls: null,
    scene: null, camera: null, renderer: null, controls: null,
    earthGroup: null, earth: null, clouds: null, satLayer: null, satPoints: null,
    selectedMesh: null, orbitLine: null, raycaster: null, pointer: null,
    satData: [], modelData: [], running: true, group: 'STATIONS', rendered: [],
    destroyed: false, resizeHandler: null, raf: 0
  };
  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function setStatus(text, ok = true) {
    const el = $('data-status'); if (!el) return;
    const color = ok ? '#00e5c3' : '#ff4b62';
    el.innerHTML = `<span class="pulse" style="background:${color};box-shadow:0 0 13px ${color}"></span><span>${esc(text)}</span>`;
  }
  function setImageStatus(text) { const el = $('image-date'); if (el) el.textContent = text; }

  async function loadDependencies() {
    if (!window.satellite) {
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/satellite.js@7.1.0/+esm');
        window.satellite = mod.default || mod;
      } catch (err) { console.error('satellite.js load failed', err); }
    }
    try {
      const THREE = await import('three');
      const controlsMod = await import('three/addons/controls/OrbitControls.js');
      state.THREE = THREE;
      state.OrbitControls = controlsMod.OrbitControls;
      return !!window.satellite;
    } catch (err) {
      console.error('Three.js load failed', err);
      setStatus('3D ENGINE LOAD FAILED · CDN / MODULE', false);
      return false;
    }
  }

  function parseTLE(raw) {
    const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean), out = [];
    for (let i = 0; i < lines.length;) {
      let name = '', l1 = '', l2 = '';
      if (lines[i].startsWith('1 ')) { l1 = lines[i]; l2 = lines[i + 1] || ''; i += 2; }
      else { name = lines[i].replace(/^0\s+/, ''); l1 = lines[i + 1] || ''; l2 = lines[i + 2] || ''; i += 3; }
      if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
      const norad = Number(l1.slice(2, 7).trim()); if (!Number.isFinite(norad)) continue;
      try { out.push({name: name || `OBJECT ${norad}`, norad, l1, l2, satrec: window.satellite.twoline2satrec(l1, l2)}); }
      catch (e) { console.warn('Skipped invalid TLE', norad, e); }
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
      return {lat, lng, alt, speed};
    } catch { return null; }
  }

  function dataAge(record) {
    const y = Number(record.satrec?.epochyr), d = Number(record.satrec?.epochdays);
    if (!Number.isFinite(y) || !Number.isFinite(d)) return 'CURRENT';
    const year = y < 57 ? 2000 + y : 1900 + y;
    const epoch = Date.UTC(year, 0, 1) + (d - 1) * 86400000;
    const hours = Math.max(0, (Date.now() - epoch) / 36e5);
    return hours < 24 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
  }

  function geoToVec3(lat, lng, alt = 400) {
    const r = EARTH_R * (1 + Math.max(-0.1, alt) / 6371);
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new state.THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  function addGraticule(THREE, parent) {
    const mat = new THREE.LineBasicMaterial({color:0x77d7d0, transparent:true, opacity:.11});
    for (let lat = -60; lat <= 60; lat += 20) {
      const pts = [];
      const r = EARTH_R * Math.cos(lat * Math.PI / 180), y = EARTH_R * Math.sin(lat * Math.PI / 180);
      for (let i=0;i<=128;i++){ const a=i/128*Math.PI*2; pts.push(new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a))); }
      parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (let lng = 0; lng < 180; lng += 15) {
      const pts = [];
      const a = lng * Math.PI / 180;
      for (let i=0;i<=128;i++){ const lat=(i/128-.5)*Math.PI; pts.push(new THREE.Vector3(EARTH_R*Math.cos(lat)*Math.sin(a), EARTH_R*Math.sin(lat), EARTH_R*Math.cos(lat)*Math.cos(a))); }
      parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      const pts2 = pts.map(v => new THREE.Vector3(-v.x,v.y,-v.z));
      parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), mat));
    }
  }

  function addStars(THREE, scene) {
    const n = 1400, arr = new Float32Array(n*3);
    for(let i=0;i<n;i++){
      const r = 18 + Math.random()*25, a=Math.random()*Math.PI*2, z=(Math.random()*2-1), s=Math.sqrt(1-z*z);
      arr[i*3]=r*s*Math.cos(a); arr[i*3+1]=r*z; arr[i*3+2]=r*s*Math.sin(a);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(arr,3));
    scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xb9e6e6,size:.035,sizeAttenuation:true,transparent:true,opacity:.72})));
  }

  function createSatelliteModel(THREE, color=0x00e5c3) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.055,.045,.09),new THREE.MeshStandardMaterial({color:0xb8c7ca,metalness:.55,roughness:.42}));
    const panelMat = new THREE.MeshStandardMaterial({color:0x143b69,metalness:.25,roughness:.3,emissive:0x06152b,emissiveIntensity:.35});
    const panelGeo = new THREE.BoxGeometry(.16,.012,.075);
    const left = new THREE.Mesh(panelGeo,panelMat), right = new THREE.Mesh(panelGeo,panelMat);
    left.position.x=-.11; right.position.x=.11;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.12,6),new THREE.MeshBasicMaterial({color:color}));
    mast.rotation.z=Math.PI/2;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,.07,6),new THREE.MeshBasicMaterial({color:0xdbeff0}));
    antenna.position.y=.055;
    group.add(body,left,right,mast,antenna);
    group.userData.baseColor=color;
    return group;
  }

  function buildOrbitLine(record) {
    const THREE=state.THREE;
    if (state.orbitLine) { state.scene.remove(state.orbitLine); state.orbitLine.geometry.dispose(); state.orbitLine.material.dispose(); state.orbitLine=null; }
    if (!record || !window.satellite) return;
    const meanMotion = Number(record.satrec?.no); if (!(meanMotion>0)) return;
    const periodMin = 2*Math.PI/meanMotion, step = Math.max(2, periodMin/90);
    const pts=[]; const now=Date.now();
    for(let m=-periodMin/2;m<=periodMin/2;m+=step){ const p=propagate(record,new Date(now+m*60000)); if(p) pts.push(geoToVec3(p.lat,p.lng,p.alt)); }
    if(pts.length<4) return;
    const curve=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xffad42,transparent:true,opacity:.52}));
    state.scene.add(curve); state.orbitLine=curve;
  }

  function buildGlobe() {
    const THREE=state.THREE, el=$('globe');
    if(!el || !THREE || !state.OrbitControls) return false;
    try{
      const width=Math.max(280,el.clientWidth||700), height=Math.max(360,el.clientHeight||650);
      const scene=new THREE.Scene();
      const camera=new THREE.PerspectiveCamera(35,width/height,.05,100);
      camera.position.set(0,.35,7.0);
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8)); renderer.setSize(width,height,false);
      renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.08;
      renderer.domElement.setAttribute('aria-label','Interactive realistic 3D Earth with live satellite positions');
      el.innerHTML=''; el.appendChild(renderer.domElement);

      const controls=new state.OrbitControls(camera,renderer.domElement);
      controls.enablePan=false; controls.enableDamping=true; controls.dampingFactor=.055;
      controls.minDistance=4.0; controls.maxDistance=11.5; controls.autoRotate=true; controls.autoRotateSpeed=.22;

      scene.add(new THREE.AmbientLight(0x9fc4cf,.45));
      const sun=new THREE.DirectionalLight(0xffffff,2.5); sun.position.set(5,3,6); scene.add(sun);
      const fill=new THREE.DirectionalLight(0x4fa9ff,.35); fill.position.set(-4,-1,-3); scene.add(fill);
      addStars(THREE,scene);

      const earthGroup=new THREE.Group();
      const earthMat=new THREE.MeshPhongMaterial({color:0xffffff,shininess:18,specular:0x31576b});
      const earth=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R,96,64),earthMat);
      earthGroup.add(earth);
      const wire=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*1.0015,48,32),new THREE.MeshBasicMaterial({color:0x54d6cd,wireframe:true,transparent:true,opacity:.035}));
      earthGroup.add(wire); addGraticule(THREE,earthGroup);
      const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*1.075,64,48),new THREE.MeshBasicMaterial({color:0x55dff0,transparent:true,opacity:.075,side:THREE.BackSide,blending:THREE.AdditiveBlending}));
      earthGroup.add(atmosphere);
      scene.add(earthGroup);

      const loader=new THREE.TextureLoader();
      loader.load(BLUE_MARBLE,tex=>{tex.colorSpace=THREE.SRGBColorSpace; earthMat.map=tex; earthMat.color.set(0xffffff); earthMat.needsUpdate=true;},undefined,err=>console.warn('Earth texture failed',err));
      loader.load(TOPOLOGY,tex=>{earthMat.bumpMap=tex; earthMat.bumpScale=.08; earthMat.needsUpdate=true;},undefined,()=>{});

      const satLayer=new THREE.Group(); scene.add(satLayer);
      const satPoints=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0x00f0ce,size:.055,sizeAttenuation:true,transparent:true,opacity:.72}));
      satLayer.add(satPoints);
      const selectedMesh=new THREE.Group(); selectedMesh.visible=false;
      const glow=new THREE.Mesh(new THREE.SphereGeometry(.13,18,12),new THREE.MeshBasicMaterial({color:0xffb14a,transparent:true,opacity:.9}));
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.18,.012,8,32),new THREE.MeshBasicMaterial({color:0xffb14a,transparent:true,opacity:.9})); ring.rotation.x=Math.PI/2;
      selectedMesh.add(glow,ring); satLayer.add(selectedMesh);

      const raycaster=new THREE.Raycaster(); raycaster.params.Points.threshold=.12; const pointer=new THREE.Vector2();
      renderer.domElement.addEventListener('pointerdown',e=>{
        const rect=renderer.domElement.getBoundingClientRect(); pointer.x=((e.clientX-rect.left)/rect.width)*2-1; pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
        raycaster.setFromCamera(pointer,camera); const hits=raycaster.intersectObject(satPoints);
        if(hits.length && hits[0].index!=null){ const hit=state.satData[hits[0].index]; if(hit?.record) selectRecord(hit.record.norad); }
      });

      state.scene=scene; state.camera=camera; state.renderer=renderer; state.controls=controls; state.earthGroup=earthGroup; state.earth=earth; state.satLayer=satLayer; state.satPoints=satPoints; state.selectedMesh=selectedMesh; state.raycaster=raycaster; state.pointer=pointer;
      state.resizeHandler=()=>{const w=Math.max(280,el.clientWidth||700),h=Math.max(320,el.clientHeight||650);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
      window.addEventListener('resize',state.resizeHandler,{passive:true}); state.resizeHandler();

      const animate=()=>{if(state.destroyed)return;state.raf=requestAnimationFrame(animate);controls.update();if(state.clouds)state.clouds.rotation.y+=.000035;renderer.render(scene,camera);}; animate();
      return true;
    }catch(err){console.error('3D globe initialization failed',err);setStatus('3D GLOBE INIT FAILED',false);return false;}
  }

  function updateGlobe(){
    if(!state.satPoints||!window.satellite||!state.visible.length)return;
    const THREE=state.THREE, now=new Date(), positions=[], rendered=[];
    for(const r of state.visible.slice(0,MAX_RENDER)){
      const p=propagate(r,now); if(!p)continue; const v=geoToVec3(p.lat,p.lng,p.alt);
      positions.push(v.x,v.y,v.z); rendered.push({...p,record:r,selected:state.selected?.norad===r.norad});
    }
    state.rendered=rendered; state.satData=rendered;
    state.satPoints.geometry.dispose(); state.satPoints.geometry=new THREE.BufferGeometry(); state.satPoints.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positions),3)); state.satPoints.geometry.computeBoundingSphere();

    if(state.satLayer){
      state.modelData.forEach(m=>state.satLayer.remove(m.mesh)); state.modelData=[];
      rendered.slice(0,MAX_MODELS).forEach(item=>{const mesh=createSatelliteModel(THREE,item.selected?0xffad42:0x00e5c3);const v=geoToVec3(item.lat,item.lng,item.alt);mesh.position.copy(v);mesh.lookAt(0,0,0);mesh.userData.norad=item.record.norad;state.satLayer.add(mesh);state.modelData.push({mesh,record:item.record});});
    }
    $('tracked-count').textContent=rendered.length.toLocaleString();
    if(state.selected){const p=propagate(state.selected,now);if(p){updateSelectedTelemetry(p);const v=geoToVec3(p.lat,p.lng,p.alt);state.selectedMesh.position.copy(v);state.selectedMesh.visible=true;state.selectedMesh.rotation.y+=.03;}else state.selectedMesh.visible=false;}else state.selectedMesh.visible=false;
  }

  function updateSelectedTelemetry(p){
    $('selected-lat').textContent=`${p.lat.toFixed(2)}°`; $('selected-lng').textContent=`${p.lng.toFixed(2)}°`; $('selected-alt').textContent=`${p.alt.toFixed(0)} km`; $('selected-velocity').textContent=`${p.speed.toFixed(2)} km/s`; $('altitude-kpi').textContent=`${p.alt.toFixed(0)} km`;
    const meanMotion=Number(state.selected?.satrec?.no), period=meanMotion>0?2*Math.PI/meanMotion:0; $('selected-period').textContent=period?`${period.toFixed(1)} min`:'—';
    const progress=(Date.now()/60000)%100; $('track-progress').style.width=`${20+(progress%80)}%`; $('ground-track').textContent=`${p.lat.toFixed(1)}°, ${p.lng.toFixed(1)}°`; $('selected-badge').textContent='TRACKING'; $('selected-badge').classList.add('live'); updateOrbitVisual(p);
  }
  function updateOrbitVisual(p){const sat=$('orbit-sat');if(!sat)return;const angle=Math.atan2(p.lng,p.lat)*180/Math.PI+180;sat.style.transform=`rotate(${angle}deg)`;}

  function renderList(){
    const list=$('sat-list'); $('visible-count').textContent=state.visible.length.toLocaleString();
    if(!state.visible.length){list.innerHTML='<div class="empty-list">No objects match this search.</div>';return;}
    list.innerHTML=state.visible.slice(0,160).map(r=>`<button class="sat-item ${state.selected?.norad===r.norad?'selected':''}" data-norad="${r.norad}" type="button"><span><strong>${esc(r.name)}</strong><small>NORAD ${r.norad} · ${esc(groups[state.group]||'Catalog')}</small></span><em>TRACK</em></button>`).join('');
    list.querySelectorAll('.sat-item').forEach(b=>b.addEventListener('click',()=>selectRecord(Number(b.dataset.norad))));
  }

  function selectRecord(norad){
    const r=state.records.find(x=>x.norad===norad); if(!r)return; state.selected=r; $('selected-name').textContent=r.name.toUpperCase(); $('selected-norad').textContent=String(r.norad); $('data-age').textContent=dataAge(r); renderList();
    const p=propagate(r); if(p){updateSelectedTelemetry(p);buildOrbitLine(r);if(state.controls){state.controls.autoRotate=false;state.controls.target.set(0,0,0);}}
    updateGlobe();
  }
  function filter(){const q=$('sat-search').value.trim().toLowerCase();state.visible=state.records.filter(r=>!q||r.name.toLowerCase().includes(q)||String(r.norad).includes(q));renderList();updateGlobe();}

  async function loadGroup(){
    const group=$('group-select').value; state.group=group; setStatus('FETCHING ORBITAL ELEMENTS'); $('load-group').disabled=true; $('refresh-data').disabled=true;
    try{
      const url=`${CATALOG_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=TLE`; const res=await fetch(url,{cache:'no-store'}); if(!res.ok)throw new Error(`Catalog HTTP ${res.status}`);
      const raw=await res.text(), records=parseTLE(raw); if(!records.length)throw new Error('No orbital elements returned');
      state.records=records;state.visible=records;$('catalog-count').textContent=records.length.toLocaleString();$('data-age').textContent=dataAge(records[0]);setStatus(`CATALOG ONLINE · ${groups[group]}`);renderList();
      const keep=state.selected&&records.some(x=>x.norad===state.selected.norad); selectRecord(keep?state.selected.norad:records[0].norad);
    }catch(err){console.error(err);setStatus('CATALOG REQUEST FAILED',false);$('sat-list').innerHTML=`<div class="empty-list">Live catalog could not be loaded.<br><br>${esc(err.message)}<br><br>Try Refresh.</div>`;$('catalog-count').textContent='—';$('tracked-count').textContent='—';}
    finally{$('load-group').disabled=false;$('refresh-data').disabled=false;}
  }

  function observationUrl(date){const params=new URLSearchParams({SERVICE:'WMS',REQUEST:'GetMap',VERSION:'1.3.0',LAYERS:'MODIS_Terra_CorrectedReflectance_TrueColor',CRS:'EPSG:4326',BBOX:'-180,-90,180,90',WIDTH:'1200',HEIGHT:'600',FORMAT:'image/jpeg',STYLES:'',TIME:date});return `${NASA_WMS}?${params.toString()}`;}
  function setObservation(){
    const img=$('earth-image');if(!img)return;const today=new Date(),dates=[0,1,2,3].map(d=>new Date(today-d*86400000).toISOString().slice(0,10));let i=0;
    const next=()=>{if(i>=dates.length){img.src=STATIC_EARTH;setImageStatus('BLUE MARBLE · FALLBACK');return;}const date=dates[i++];setImageStatus(`${date} · MODIS TERRA`);img.onload=()=>setImageStatus(`${date} · MODIS TERRA · ONLINE`);img.onerror=next;img.src=observationUrl(date);};next();
  }

  function ensureThemeFallback(){
    const button=$('theme-toggle'); if(!button||button.dataset.spaceThemeReady==='true')return;
    button.dataset.spaceThemeReady='true'; button.addEventListener('click',e=>{e.preventDefault();const current=document.documentElement.getAttribute('data-theme')||'dark';const next=current==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',next);localStorage.setItem('pystart-theme',next);const icon=button.querySelector('.theme-icon'),label=button.querySelector('.theme-label');if(icon)icon.textContent=next==='dark'?'☀':'☾';if(label)label.textContent=next==='dark'?'Light':'Dark';window.dispatchEvent(new CustomEvent('pystart-theme-change',{detail:{theme:next}}));});
  }

  function wire(){
    $('load-group').addEventListener('click',loadGroup);$('refresh-data').addEventListener('click',loadGroup);$('sat-search').addEventListener('input',filter);$('search-clear').addEventListener('click',()=>{$('sat-search').value='';filter();$('sat-search').focus();});
    $('auto-rotate').addEventListener('click',()=>{state.running=!state.running;if(state.controls)state.controls.autoRotate=state.running;$('auto-rotate').classList.toggle('active',state.running);$('auto-rotate').textContent=state.running?'AUTO ROTATE':'ROTATION PAUSED';});
    $('reset-view').addEventListener('click',()=>{if(!state.camera||!state.controls)return;state.camera.position.set(0,.35,7);state.controls.target.set(0,0,0);state.controls.autoRotate=state.running;state.controls.update();});
    ensureThemeFallback();
  }
  function tick(){if(state.destroyed)return;updateGlobe();setTimeout(()=>requestAnimationFrame(tick),1000);}
  async function init(){setStatus('LOADING 3D ENGINE');const ready=await loadDependencies();if(!ready){setStatus('3D ENGINE LOAD FAILED · CHECK CDN',false);return;}if(!buildGlobe())return;wire();setObservation();await loadGroup();tick();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
