(() => {
  'use strict';

  const CATALOG_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
  const NASA_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
  const EARTH_TEXTURE = 'https://cdn.jsdelivr.net/npm/three-globe@2.46.2/example/img/earth-night.jpg';
  const groups = { STATIONS:'Space Stations', STARLINK:'Starlink', GNSS:'GNSS / Navigation', WEATHER:'Weather / Earth Resources', ACTIVE:'Active Satellites' };
  const MAX_RENDER = 650;
  const state = { records:[], visible:[], selected:null, globe:null, running:true, lastFetch:0, group:'STATIONS' };
  const $ = id => document.getElementById(id);

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function setStatus(text, ok=true){ $('data-status').innerHTML=`<span class="pulse" style="background:${ok?'#00e5c3':'#ff4b62'};box-shadow:0 0 13px ${ok?'#00e5c3':'#ff4b62'}"></span><span>${esc(text)}</span>`; }
  function parseTLE(raw){
    const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean), out=[];
    for(let i=0;i<lines.length;){
      let name='', l1='', l2='';
      if(lines[i].startsWith('1 ')){ l1=lines[i]; l2=lines[i+1]||''; i+=2; }
      else { name=lines[i].replace(/^0\s+/,''); l1=lines[i+1]||''; l2=lines[i+2]||''; i+=3; }
      if(!l1.startsWith('1 ')||!l2.startsWith('2 ')) continue;
      const norad=Number(l1.slice(2,7).trim());
      try{ const satrec=satellite.twoline2satrec(l1,l2); out.push({name:name||`OBJECT ${norad}`,norad,l1,l2,satrec}); }catch(e){}
    }
    return out;
  }
  function propagate(r,date=new Date()){
    try{
      const pv=satellite.propagate(r.satrec,date), pos=pv.position, vel=pv.velocity;
      if(!pos || !vel) return null;
      const gmst=satellite.gstime(date), geo=satellite.eciToGeodetic(pos,gmst);
      const lat=satellite.degreesLat(geo.latitude), lng=satellite.degreesLong(geo.longitude), alt=geo.height;
      const speed=Math.sqrt(vel.x*vel.x+vel.y*vel.y+vel.z*vel.z);
      return {lat,lng,alt,speed};
    }catch(e){return null;}
  }
  function formatAge(r){
    const epoch=r.satrec?.epochyr ? String(r.satrec.epochyr).padStart(3,'0') : '';
    return epoch ? 'GP set' : 'Current';
  }
  function buildGlobe(){
    if(typeof Globe!=='function'){ setStatus('GLOBE LIBRARY FAILED',false); return; }
    const el=$('globe');
    state.globe=Globe(el,{waitForGlobeReady:true,animateIn:true})
      .globeImageUrl(EARTH_TEXTURE)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor('#00d9bc').atmosphereAltitude(.12)
      .showGraticules(true).graticuleColor(()=>'rgba(0,229,195,.08)')
      .pointLat('lat').pointLng('lng').pointAltitude(d=>Math.min(.42,Math.max(.035,(d.alt||400)/6371)))
      .pointRadius(d=>d.selected?.055:.022)
      .pointColor(d=>d.selected?'#ffad42':'#00e5c3')
      .pointsMerge(true)
      .onPointClick(d=>selectRecord(d.record?.norad));
    state.globe.controls().autoRotate=true; state.globe.controls().autoRotateSpeed=.18; state.globe.controls().enablePan=false;
    window.addEventListener('resize',()=>{ if(state.globe) state.globe.width(el.clientWidth).height(el.clientHeight); });
    state.globe.width(el.clientWidth).height(el.clientHeight);
  }
  function updateGlobe(){
    if(!state.globe) return;
    const now=new Date();
    const limit=state.visible.slice(0,MAX_RENDER), pts=[];
    for(const r of limit){ const p=propagate(r,now); if(p) pts.push({...p,record:r,selected:state.selected?.norad===r.norad}); }
    state.rendered=pts;
    state.globe.pointsData(pts);
    $('tracked-count').textContent=pts.length.toLocaleString();
    if(state.selected){
      const p=propagate(state.selected,now); if(p) updateSelectedTelemetry(p);
    }
  }
  function updateSelectedTelemetry(p){
    $('selected-lat').textContent=`${p.lat.toFixed(2)}°`;
    $('selected-lng').textContent=`${p.lng.toFixed(2)}°`;
    $('selected-alt').textContent=`${p.alt.toFixed(0)} km`;
    $('selected-velocity').textContent=`${p.speed.toFixed(2)} km/s`;
    $('altitude-kpi').textContent=`${p.alt.toFixed(0)} km`;
    const period=state.selected?.satrec?.no ? 2*Math.PI/state.selected.satrec.no : 0;
    $('selected-period').textContent=period?`${period.toFixed(1)} min`:'—';
    const progress=((Date.now()/60000)%100); $('track-progress').style.width=`${20+(progress%80)}%`;
    $('ground-track').textContent=`${p.lat.toFixed(1)}°, ${p.lng.toFixed(1)}°`;
    $('selected-badge').textContent='TRACKING';
    $('selected-badge').classList.add('live');
    updateOrbitVisual(p);
  }
  function updateOrbitVisual(p){
    const sat=$('orbit-sat'); const angle=(Math.atan2(p.lng,p.lat)*180/Math.PI)+180; sat.style.transform=`rotate(${angle}deg)`; sat.style.animationDuration=`${Math.max(3,Math.min(12,(state.selected?.satrec?.no?2*Math.PI/state.selected.satrec.no:90)/2))}s`; }
  function renderList(){
    const list=$('sat-list'); $('visible-count').textContent=state.visible.length.toLocaleString();
    if(!state.visible.length){list.innerHTML='<div class="empty-list">No objects match this search.</div>';return;}
    const items=state.visible.slice(0,160); list.innerHTML=items.map(r=>`<button class="sat-item ${state.selected?.norad===r.norad?'selected':''}" data-norad="${r.norad}" type="button"><span><strong>${esc(r.name)}</strong><small>NORAD ${r.norad} · ${groups[state.group]||'Catalog'}</small></span><em>TRACK</em></button>`).join('');
    list.querySelectorAll('.sat-item').forEach(b=>b.addEventListener('click',()=>selectRecord(Number(b.dataset.norad))));
  }
  function selectRecord(norad){
    const r=state.records.find(x=>x.norad===norad); if(!r) return; state.selected=r;
    $('selected-name').textContent=r.name.toUpperCase(); $('selected-norad').textContent=String(r.norad); $('data-age').textContent=formatAge(r); renderList();
    const p=propagate(r); if(p) updateSelectedTelemetry(p);
    if(state.globe){ state.globe.pointOfView({lat:p?.lat||0,lng:p?.lng||0,altitude:2.1},900); }
  }
  function filter(){
    const q=$('sat-search').value.trim().toLowerCase(); state.visible=state.records.filter(r=>!q||r.name.toLowerCase().includes(q)||String(r.norad).includes(q)); renderList(); updateGlobe(); }
  async function loadGroup(){
    const group=$('group-select').value; state.group=group; setStatus('FETCHING ORBITAL ELEMENTS');
    try{
      const res=await fetch(`${CATALOG_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=TLE&MAX=10000`,{cache:'no-store'});
      if(!res.ok) throw new Error('Catalog request failed');
      const raw=await res.text(); const records=parseTLE(raw); if(!records.length) throw new Error('No TLE objects returned');
      state.records=records; state.visible=records; state.lastFetch=Date.now(); $('catalog-count').textContent=records.length.toLocaleString(); $('data-age').textContent='CURRENT';
      setStatus(`CATALOG ONLINE · ${group}`); renderList(); updateGlobe();
      if(!state.selected || !records.some(x=>x.norad===state.selected.norad)) selectRecord(records[0].norad);
    }catch(err){ console.error(err); setStatus('CATALOG REQUEST FAILED',false); $('sat-list').innerHTML='<div class="empty-list">Could not load live orbital data. Check your internet connection or try Refresh.</div>'; }
  }
  function setObservation(){
    const d=new Date(); const date=d.toISOString().slice(0,10); const url=`${NASA_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&CRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=1200&HEIGHT=600&FORMAT=image/jpeg&STYLES=&TIME=${date}`;
    $('earth-image').src=url; $('image-date').textContent=date+' · MODIS TERRA';
    $('earth-image').addEventListener('error',()=>{ const y=new Date(Date.now()-86400000).toISOString().slice(0,10); $('earth-image').src=`${NASA_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&CRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=1200&HEIGHT=600&FORMAT=image/jpeg&STYLES=&TIME=${y}`; $('image-date').textContent=y+' · FALLBACK'; },{once:true});
  }
  function wire(){
    $('load-group').addEventListener('click',loadGroup); $('refresh-data').addEventListener('click',loadGroup); $('sat-search').addEventListener('input',filter); $('search-clear').addEventListener('click',()=>{ $('sat-search').value=''; filter(); $('sat-search').focus(); });
    $('auto-rotate').addEventListener('click',()=>{state.running=!state.running; state.globe.controls().autoRotate=state.running; $('auto-rotate').classList.toggle('active',state.running); $('auto-rotate').textContent=state.running?'AUTO ROTATE':'ROTATION PAUSED';});
    $('reset-view').addEventListener('click',()=>state.globe?.pointOfView({lat:20,lng:0,altitude:2.4},800));
  }
  function tick(){ updateGlobe(); requestAnimationFrame(()=>setTimeout(tick,1000)); }
  function init(){ if(!window.satellite){setStatus('SATELLITE ENGINE FAILED',false);return;} buildGlobe(); wire(); setObservation(); loadGroup(); tick(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
