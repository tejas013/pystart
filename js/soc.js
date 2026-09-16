(function(){
  'use strict';
  const root = document.querySelector('.soc-page');
  if (!root) return;

  const state = {
    paused: false,
    events: [],
    blocked: Number(localStorage.getItem('pystart-soc-blocked') || 18),
    total: Number(localStorage.getItem('pystart-soc-total') || 0),
    seed: 0,
    history: [],
    tactics: { 'Initial Access': 18, 'Credential Access': 24, 'Discovery': 15, 'Execution': 11, 'Persistence': 8, 'Command & Control': 20 }
  };

  const scenarios = {
    bruteforce: {name:'Brute-force login burst', severity:'high', tactic:'Credential Access', source:'185.91.72.14', detail:'Repeated authentication failures against a fictional admin endpoint.'},
    portscan: {name:'Port scan detected', severity:'medium', tactic:'Discovery', source:'45.77.19.62', detail:'Sequential connection attempts across simulated service ports.'},
    sql: {name:'SQL injection pattern', severity:'critical', tactic:'Initial Access', source:'91.204.18.33', detail:'Suspicious query pattern matched a simulated web detection rule.'},
    ddos: {name:'DDoS traffic spike', severity:'high', tactic:'Command & Control', source:'203.0.113.44', detail:'Abnormal request volume detected in fictional perimeter telemetry.'},
    malware: {name:'Malware behavior alert', severity:'critical', tactic:'Execution', source:'10.0.4.27', detail:'A simulated endpoint reported suspicious process behavior.'},
    phishing: {name:'Phishing attachment', severity:'medium', tactic:'Initial Access', source:'198.51.100.19', detail:'A fictional email gateway flagged a suspicious attachment.'}
  };

  const automatic = [
    scenarios.bruteforce, scenarios.portscan, scenarios.ddos,
    {name:'Suspicious login',severity:'low',tactic:'Credential Access',source:'10.0.2.18',detail:'Login from a fictional unusual session profile.'},
    {name:'Endpoint policy change',severity:'low',tactic:'Persistence',source:'10.0.3.12',detail:'A simulated endpoint configuration change was recorded.'},
    {name:'Directory probing',severity:'medium',tactic:'Discovery',source:'192.0.2.71',detail:'Multiple fictional web paths were requested in sequence.'}
  ];

  const $ = id => document.getElementById(id);
  const nowTime = () => new Date().toLocaleTimeString([], {hour12:false});
  const esc = s => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const rand = n => Math.floor(Math.random()*n);

  function makeEvent(template){
    const event = {...template, id: Date.now() + Math.random(), time:nowTime(), status:'Active'};
    state.events.unshift(event);
    state.events = state.events.slice(0, 18);
    state.total++;
    state.tactics[event.tactic] = (state.tactics[event.tactic] || 0) + 1;
    if (state.events.length === 1) state.history = [];
    state.history.push({critical:event.severity==='critical'?1:0,high:event.severity==='high'?1:0,medium:event.severity==='medium'?1:0,low:event.severity==='low'?1:0});
    state.history = state.history.slice(-18);
    renderAll();
  }

  function seed(){
    const seedItems = [
      {...scenarios.sql,time:'14:17:08',status:'Investigating'},
      {...scenarios.bruteforce,time:'14:16:42',status:'Active'},
      {...automatic[3],time:'14:15:59',status:'Blocked'},
      {...automatic[5],time:'14:15:12',status:'Investigating'},
      {...scenarios.phishing,time:'14:14:48',status:'Active'},
      {...automatic[4],time:'14:13:33',status:'Blocked'}
    ];
    state.events = seedItems.map((e,i)=>({...e,id:i+1}));
    state.total = Math.max(state.total, 84);
    state.history = Array.from({length:18},()=>({critical:rand(3),high:rand(5),medium:rand(7),low:rand(9)}));
  }

  function severityRank(s){return ({critical:4,high:3,medium:2,low:1})[s]||0}
  function filtered(){
    const q = ($('event-search')?.value || '').trim().toLowerCase();
    const sev = $('severity-filter')?.value || 'all';
    return state.events.filter(e => (sev==='all'||e.severity===sev) && (!q || [e.name,e.source,e.tactic,e.detail,e.status].some(v=>String(v).toLowerCase().includes(q))));
  }

  function renderMetrics(){
    const active = state.events.filter(e=>e.status==='Active').length;
    const blocked = state.events.filter(e=>e.status==='Blocked').length + state.blocked;
    const health = Math.max(82, 100 - active*2 - state.events.filter(e=>e.severity==='critical'&&e.status==='Active').length*4);
    $('kpi-threats').textContent = active;
    $('kpi-events').textContent = state.total;
    $('kpi-blocked').textContent = blocked;
    $('kpi-health').textContent = health + '%';
    $('kpi-health-label').textContent = health > 94 ? 'All systems nominal' : health > 87 ? 'Minor degradation' : 'Analyst attention required';
    $('kpi-threat-delta').textContent = '+' + Math.min(9, state.events.filter(e=>e.status==='Active').length);

    const score = Math.min(96, Math.max(12, 25 + active*5 + state.events.filter(e=>e.severity==='critical'&&e.status==='Active').length*9));
    const ring = document.querySelector('.risk-ring');
    $('risk-score').textContent = score;
    $('risk-bar-fill').style.width = score + '%';
    ring.style.background = `conic-gradient(var(--violet) 0 ${score}%,var(--surface-strong) ${score}% 100%)`;
    let label='LOW', caption='Security activity is within normal simulated range.';
    if(score>=75){label='CRITICAL';caption='Multiple high-priority events require immediate triage.'}
    else if(score>=55){label='HIGH';caption='Elevated activity requires active analyst attention.'}
    else if(score>=35){label='GUARDED';caption='Elevated activity requires analyst attention.'}
    $('risk-label').textContent=label;$('risk-caption').textContent=caption;
    $('risk-label').style.color = score>=75 ? 'var(--danger)' : score>=55 ? 'var(--danger)' : 'var(--amber)';
    $('queue-count').textContent = active + ' OPEN';
    $('assets-risk').textContent = Math.min(9, Math.max(1, 1 + Math.floor(active/2)));
  }

  function renderEvents(){
    const list = filtered();
    $('event-table-body').innerHTML = list.slice(0,9).map(e=>`<tr>
      <td class="event-time">${esc(e.time)}</td>
      <td><span class="severity-badge ${e.severity}">${e.severity.toUpperCase()}</span></td>
      <td><strong>${esc(e.name)}</strong><br><span style="color:var(--muted);font-size:.58rem">${esc(e.detail)}</span></td>
      <td class="event-time">${esc(e.source)}</td>
      <td><span class="tactic-badge">${esc(e.tactic)}</span></td>
      <td><span class="status-badge ${e.status.toLowerCase()}">${esc(e.status)}</span></td>
      <td><button class="event-action" data-action="investigate" data-id="${e.id}">Open</button></td>
    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">No matching events.</td></tr>';

    $('mobile-events').innerHTML = list.slice(0,8).map(e=>`<article class="mobile-event">
      <div class="mobile-event-top"><strong>${esc(e.name)}</strong><span class="severity-badge ${e.severity}">${e.severity.toUpperCase()}</span></div>
      <p>${esc(e.detail)}</p><div class="mobile-event-bottom"><span>${esc(e.source)}</span><span>${esc(e.tactic)}</span><span>${esc(e.status)}</span></div>
    </article>`).join('') || '<div style="padding:25px;text-align:center;color:var(--muted);font-size:.7rem">No matching events.</div>';
  }

  function renderIncidents(){
    const open = state.events.filter(e=>e.status==='Active').sort((a,b)=>severityRank(b.severity)-severityRank(a.severity)).slice(0,5);
    $('incident-list').innerHTML = open.map(e=>`<div class="incident-item"><span class="incident-dot ${e.severity}"></span><div class="incident-main"><strong>${esc(e.name)}</strong><span>${esc(e.source)} · ${esc(e.tactic)} · ${esc(e.time)}</span></div><button class="incident-action" data-action="block" data-id="${e.id}">Block</button></div>`).join('') || '<div style="padding:28px 0;color:var(--muted);font-size:.7rem">No open incidents. Good work.</div>';
  }

  function renderTactics(){
    const values=Object.entries(state.tactics).sort((a,b)=>b[1]-a[1]); const max=Math.max(...values.map(x=>x[1]),1);
    $('tactic-bars').innerHTML=values.map(([name,value])=>`<div class="tactic-row"><label>${esc(name)}</label><div class="tactic-track"><span style="width:${Math.max(6,value/max*100)}%"></span></div><b>${value}</b></div>`).join('');
  }

  function drawChart(){
    const canvas=$('threat-chart'), ctx=canvas.getContext('2d'); const rect=canvas.getBoundingClientRect(); const dpr=window.devicePixelRatio||1; const w=Math.max(320,rect.width),h=Math.max(180,rect.height); canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const styles=getComputedStyle(document.documentElement); const border=styles.getPropertyValue('--border').trim(); const muted=styles.getPropertyValue('--muted').trim(); const danger=styles.getPropertyValue('--danger').trim(); const amber=styles.getPropertyValue('--amber').trim(); const violet=styles.getPropertyValue('--violet').trim(); const mint=styles.getPropertyValue('--mint').trim();
    const pad={l:8,r:6,t:15,b:25}; const cw=w-pad.l-pad.r,ch=h-pad.t-pad.b; const points=state.history.length?state.history:Array.from({length:18},()=>({critical:0,high:0,medium:0,low:0}));
    ctx.strokeStyle=border;ctx.lineWidth=1;for(let i=0;i<4;i++){const y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}
    const series=[['critical',danger],['high','#d989ff'],['medium',amber],['low',mint]];
    series.forEach(([key,color])=>{ctx.beginPath();points.forEach((p,i)=>{const x=pad.l+cw*i/(points.length-1||1);const total=p.critical+p.high+p.medium+p.low;const y=pad.t+ch-(Math.min(10,total)/10)*ch; i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke()});
    ctx.fillStyle=muted;ctx.font='9px JetBrains Mono, monospace';ctx.fillText('LIVE',pad.l,h-5);ctx.fillText('18 EVENTS',w-62,h-5);
    $('chart-empty').style.display=state.history.length?'none':'grid';
  }

  function renderAll(){renderMetrics();renderEvents();renderIncidents();renderTactics();drawChart();}

  function handleAction(action,id){
    const e=state.events.find(x=>String(x.id)===String(id)); if(!e)return;
    if(action==='block'){e.status='Blocked';state.blocked++;localStorage.setItem('pystart-soc-blocked',state.blocked);showToast('Incident blocked','Analyst action recorded locally.');}
    if(action==='investigate'){e.status=e.status==='Investigating'?'Active':'Investigating';showToast(e.status==='Investigating'?'Incident opened':'Incident returned to active queue','Simulated investigation state updated.');}
    renderAll();
  }

  function showToast(title,text){if(window.showToast)window.showToast(title,text);else{const el=document.createElement('div');el.textContent=title+' — '+text;document.body.appendChild(el);setTimeout(()=>el.remove(),2500)}}

  document.addEventListener('click',e=>{
    const action=e.target.closest('[data-action]'); if(action){handleAction(action.dataset.action,action.dataset.id);return}
    const sim=e.target.closest('[data-sim]'); if(sim){const item=scenarios[sim.dataset.sim];makeEvent(item);$('sim-output').textContent=`Generated ${item.severity.toUpperCase()} telemetry: ${item.name} from ${item.source}.`;showToast('Simulation generated','A fictional security event was added to the stream.');}
  });
  $('event-search').addEventListener('input',renderEvents);$('severity-filter').addEventListener('change',renderEvents);
  $('pause-stream').addEventListener('click',()=>{state.paused=!state.paused;$('pause-stream').textContent=state.paused?'Resume Stream':'Pause Stream';showToast(state.paused?'Stream paused':'Stream resumed','Live event generation updated.');});
  window.addEventListener('resize',drawChart);
  window.addEventListener('pystart-theme-change',drawChart);
  setInterval(()=>{ $('soc-clock').textContent=nowTime(); },1000);
  setInterval(()=>{if(!state.paused){makeEvent(automatic[rand(automatic.length)]);}},5000);
  $('soc-clock').textContent=nowTime(); seed(); renderAll();
})();
