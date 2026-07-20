// ── API LAYER ─────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('api' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error ' + res.status);
  }
  return res.json();
}

async function loadAll() {
  try {
    const [comp, sales, recs, cpls] = await Promise.all([
      api('GET', '/companies'),
      api('GET', '/salespeople'),
      api('GET', '/records'),
      api('GET', '/complaints'),
    ]);
    companies   = comp.map(c => c.name);
    salespeople = sales.map(s => s.name);
    records     = recs;
    complaints  = cpls;
  } catch(err) {
    console.error('loadAll error:', err.message);
  }
  render();
}

const CHANNELS = [
  { id:"whatsapp", label:"Chat / Message",   icon:"💬", bg:"#e8f5e9", color:"#2e7d32" },
  { id:"offline",  label:"Offline Meeting", icon:"🤝", bg:"#e3f2fd", color:"#1565c0" },
  { id:"phone",    label:"Phone Call",      icon:"📞", bg:"#e8eaf6", color:"#283593" },
  { id:"zoom",     label:"Zoom / Video",    icon:"🎥", bg:"#e1f5fe", color:"#01579b" },
];

let companies   = [];
let salespeople = [];
let records = [];
let complaints = [];
let currentTab = "followup";
let expandedMeetings = new Set();
let expandedComplaints = new Set();
let analyzingRecord = null;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function initials(name) { const w=name.split(" ").filter(Boolean); return (w.length>=3?w.slice(0,3):w.slice(0,2)).map(x=>x[0]).join("").toUpperCase(); }
function avatarStyle(name, size) {
  const pal=[{bg:"#dbeafe",c:"#1d4ed8"},{bg:"#d1fae5",c:"#065f46"},{bg:"#ede9fe",c:"#5b21b6"},{bg:"#fce7f3",c:"#9d174d"},{bg:"#ccfbf1",c:"#0f766e"}];
  const p=pal[name.charCodeAt(0)%pal.length];
  return `width:${size}px;height:${size}px;border-radius:50%;background:${p.bg};color:${p.c};display:flex;align-items:center;justify-content:center;font-size:${size<32?11:13}px;font-weight:600;flex-shrink:0;`;
}
function avatarHTML(name,size=36){ return `<div class="avatar" style="${avatarStyle(name,size)}">${initials(name)}</div>`; }
function daysUntil(d){ if(!d) return null; return Math.ceil((new Date(d)-new Date())/86400000); }
function fuBadgeHTML(deadline){
  const days=daysUntil(deadline);
  const ov=days!==null&&days<0, soon=days!==null&&days<=3;
  const bg=ov?"#fee2e2":soon?"#fef3c7":"#dcfce7", c=ov?"#dc2626":soon?"#b45309":"#15803d";
  const lbl=days===null?"Follow-Up":ov?`${Math.abs(days)}d overdue`:days===0?"Today":`${days}d left`;
  return `<span class="fu-badge" style="background:${bg};color:${c}">● Follow-Up · ${lbl}</span>`;
}
function chPillHTML(chId){
  const ch=CHANNELS.find(c=>c.id===chId)||CHANNELS[0];
  return `<span class="ch-pill" style="background:${ch.bg};color:${ch.color}">${ch.icon} ${ch.label}</span>`;
}
function e(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function getGrouped(){
  const q=(document.getElementById("search-input")||{}).value||"";
  const g={};
  records.filter(r=>{ if(!q)return true; const ql=q.toLowerCase(); return r.company.toLowerCase().includes(ql)||r.contactPerson.toLowerCase().includes(ql); })
    .forEach(r=>{ if(!g[r.company])g[r.company]=[]; g[r.company].push(r); });
  Object.values(g).forEach(arr=>arr.sort((a,b)=>b.date.localeCompare(a.date)));
  return g;
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render(){
  const grouped=getGrouped();
  const urgentItems=Object.values(grouped).map(ms=>ms[0]).filter(m=>m&&m.urgentFollowUp)
    .sort((a,b)=>(daysUntil(a.followUpDeadline)??9999)-(daysUntil(b.followUpDeadline)??9999));
  const urgentCount=urgentItems.length;
  const openComplaints=complaints.filter(c=>c.status!=="resolved");

  document.getElementById("stat-companies").textContent=Object.keys(grouped).length;
  document.getElementById("stat-meetings").textContent=records.length;
  const su=document.getElementById("stat-urgent");
  su.textContent=urgentCount; su.style.color=urgentCount>0?"#b45309":"#64748b";
  const sc=document.getElementById("stat-complaints");
  sc.textContent=openComplaints.length; sc.style.color=openComplaints.length>0?"#dc2626":"#64748b";

  const tb=document.getElementById("tab-followup");
  tb.innerHTML=`Follow-Up${urgentCount>0?`<span class="badge">${urgentCount}</span>`:""}`;
  const tc=document.getElementById("tab-complaints");
  tc.innerHTML=`Complaints${openComplaints.length>0?`<span class="badge">${openComplaints.length}</span>`:""}`;
  ["followup","recent","companies","complaints"].forEach(t=>{
    const el=document.getElementById("tab-"+t);
    if(el) el.classList.toggle("active",t===currentTab);
  });

  document.getElementById("search-wrap").style.display=(currentTab==="companies"||currentTab==="complaints")?"block":"none";
  if(currentTab==="complaints"){
    document.getElementById("search-input").placeholder="Search complaints by company...";
  } else {
    document.getElementById("search-input").placeholder="Search by company or contact...";
  }
  document.getElementById("btn-db-open").textContent=`Client DB (${companies.length})`;
  document.getElementById("btn-sales-open").textContent=`Sales DB (${salespeople.length})`;

  const content=document.getElementById("tab-content");

  if(currentTab==="complaints"){
    renderComplaintsTab(content);
    return;
  }

  if(currentTab==="followup"){
    if(!urgentItems.length){content.innerHTML=`<div class="empty"><div style="font-size:32px;margin-bottom:12px">✓</div>No pending follow-ups</div>`;return;}
    content.innerHTML=urgentItems.map(item=>{
      const ch=CHANNELS.find(c=>c.id===item.channel)||CHANNELS[0];
      const days=daysUntil(item.followUpDeadline);
      const bc=days<0?"#fca5a5":days<=3?"#fde68a":"#bbf7d0";
      return `<div class="fu-list-item" style="border:1px solid ${bc};margin-bottom:8px">
        ${avatarHTML(item.company,32)}
        <div class="fu-item-body">
          <div class="fu-item-top">
            <div><span class="fu-company">${e(item.company)}</span><span class="fu-contact">${e(item.contactPerson)}</span></div>
            ${fuBadgeHTML(item.followUpDeadline)}
          </div>
          ${item.followUpNote?`<p class="fu-note">${e(item.followUpNote)}</p>`:""}
          <div class="fu-meta">
            <span class="ch-pill" style="background:${ch.bg};color:${ch.color}">${ch.icon} ${ch.label}</span>
            <span style="font-size:11px;color:#94a3b8">${item.date}</span>
            <button class="btn-ai" style="font-size:11px;padding:3px 10px;border-radius:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe" onclick='openAI(records.find(r=>r.id=="${item.id}"))'>📊 Analysis</button>
            <button class="btn-edit" onclick='editRecord("${item.id}")'>✏</button>
            <button class="btn-del" onclick='deleteRecord("${item.id}")'>🗑</button>
            <button class="btn-pdf" style="font-size:11px;padding:3px 10px;border-radius:6px;margin-left:auto" onclick='exportPDF(records.find(r=>r.id=="${item.id}"))'>📄 MoM PDF</button>
          </div>
        </div>
      </div>`;
    }).join("");
  } else if(currentTab==="recent"){
    const sorted=[...records].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
    if(!sorted.length){content.innerHTML=`<div class="empty">No communications logged yet</div>`;return;}
    content.innerHTML=sorted.map(m=>{
      const ch=CHANNELS.find(c=>c.id===m.channel)||CHANNELS[0];
      const expanded=expandedMeetings.has(m.id);
      const ptags=(m.participants||[]).map(p=>`<span class="tag">${e(p)}</span>`).join("");
      const discHtml=(m.discussions||[]).map(d=>`<div class="disc-view">${d.topic?`<div class="disc-view-topic">${e(d.topic)}</div>`:""}${(d.points||[]).map(pt=>`<div class="disc-view-pt"><span class="poin-dot">·</span>${e(pt)}</div>`).join("")}</div>`).join("");
      return `<div class="recent-item" style="margin-bottom:6px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:12px;width:100%;cursor:pointer" onclick="toggleMeeting('${m.id}')">
          ${avatarHTML(m.company,32)}
          <div class="recent-body">
            <div class="recent-name">${e(m.company)}${m.urgentFollowUp?fuBadgeHTML(m.followUpDeadline):""}</div>
            <div class="recent-meta">
              <span class="ch-pill" style="background:${ch.bg};color:${ch.color}">${ch.icon} ${ch.label}</span>
              <span style="font-size:11px;color:#94a3b8">${m.date}</span>
              <span style="font-size:11px;color:#94a3b8">· ${e(m.contactPerson)}</span>
            </div>
          </div>
          <span style="font-size:10px;color:#cbd5e1;flex-shrink:0;margin-left:auto">${expanded?"▲":"▼"}</span>
        </div>
        ${expanded?`<div style="width:100%;border-top:1px solid #f1f5f9;margin-top:10px;padding-top:12px;display:flex;flex-direction:column;gap:12px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            ${m.salesRep?`<div><div class="detail-lbl">Logged by</div><span class="tag">${e(m.salesRep)}</span></div>`:""}
            ${m.time?`<div><div class="detail-lbl">Time</div><span style="font-size:12px;color:#475569">${e(m.time)}</span></div>`:""}
            ${m.location&&m.channel==="offline"?`<div><div class="detail-lbl">Location</div><span style="font-size:12px;color:#475569">${e(m.location)}</span></div>`:""}
          </div>
          <div class="detail-grid">
            <div><div class="detail-lbl">Attendees</div><div class="tags-wrap">${ptags||`<span style="color:#94a3b8;font-size:12px">—</span>`}</div></div>
            <div><div class="detail-lbl">Discussion Points</div><div>${discHtml||`<span style="color:#94a3b8;font-size:12px">—</span>`}</div></div>
          </div>
          ${m.urgentFollowUp?`<div class="fu-box on" style="margin-top:2px">
            <div style="font-size:12px;font-weight:500;color:#1d4ed8;margin-bottom:4px">Follow-Up</div>
            <div style="font-size:12px;color:#475569">${e(m.followUpNote||"—")}</div>
            ${m.followUpDeadline?`<div style="font-size:11px;color:#b45309;margin-top:4px">Deadline: ${m.followUpDeadline}</div>`:""}
          </div>`:""}
          <div class="action-btns">
            <button class="btn-ai" style="font-size:11px;padding:4px 10px;border-radius:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe" onclick='event.stopPropagation();openAI(records.find(r=>r.id=="${m.id}"))'>📊 Analysis</button>
            <button class="btn-mom" style="font-size:11px;padding:4px 10px;border-radius:6px" onclick='event.stopPropagation();exportPDF(records.find(r=>r.id=="${m.id}"))'>📄 MoM PDF</button>
            <button class="btn-edit" onclick='event.stopPropagation();editRecord("${m.id}")'>✏ Edit</button>
            <button class="btn-del" onclick='event.stopPropagation();deleteRecord("${m.id}")'>🗑 Delete</button>
          </div>
        </div>`:""}
      </div>`;
    }).join("");
  } else {
    const sorted=Object.entries(grouped).sort(([,a],[,b])=>{
      const au=a[0]?.urgentFollowUp?1:0,bu=b[0]?.urgentFollowUp?1:0;
      if(bu!==au)return bu-au; return b[0]?.date.localeCompare(a[0]?.date);
    });
    if(!sorted.length){content.innerHTML=`<div class="empty">${records.length===0?"No communications logged yet. Click '+ Log Communication' to start.":"No results found."}</div>`;return;}
    content.innerHTML=sorted.map(([company,meetings])=>renderCompanyCard(company,meetings)).join("");
  }
}

function renderCompanyCard(company,meetings){
  const latest=meetings[0], hasUrgent=latest?.urgentFollowUp;
  return `<div class="company-card${hasUrgent?" urgent":""}" style="margin-bottom:12px">
    <div class="company-header" style="flex-wrap:wrap">
      ${avatarHTML(company)}
      <div class="company-info" style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="company-name">${e(company)}</span>
          ${hasUrgent?fuBadgeHTML(latest.followUpDeadline):""}
        </div>
        <div class="company-sub">${e(latest?.contactPerson||"")} · ${meetings.length} communication${meetings.length!==1?"s":""}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn-excel" style="font-size:12px;padding:6px 14px;border-radius:8px" onclick='event.stopPropagation();exportCompanyExcel("${e(company)}")'>📊 Rekap Excel</button>
        <button class="btn-log" onclick='openFormPrefill("${e(company)}","${e(latest?.contactPerson||"")}">+ Log</button>
      </div>
    </div>
    ${meetings.map((m,idx)=>renderMeetingRow(m,idx===0)).join("")}
  </div>`;
}

function renderMeetingRow(m,isLatest){
  const expanded=expandedMeetings.has(m.id);
  const ch=CHANNELS.find(c=>c.id===m.channel)||CHANNELS[0];
  let detail="";
  if(expanded){
    const ptags=(m.participants||[]).map(p=>`<span class="tag">${e(p)}</span>`).join("");
    const discHtml=(m.discussions||[]).map(d=>`<div class="disc-view">${d.topic?`<div class="disc-view-topic">${e(d.topic)}</div>`:""}${(d.points||[]).map(pt=>`<div class="disc-view-pt"><span class="poin-dot">·</span>${e(pt)}</div>`).join("")}</div>`).join("");
    const fuOn=m.urgentFollowUp;
    detail=`<div class="meeting-detail">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:4px">
        ${m.salesRep?`<div><div class="detail-lbl">Logged by</div><span class="tag">${e(m.salesRep)}</span></div>`:""}
        ${m.time?`<div><div class="detail-lbl">Time</div><span style="font-size:12px;color:#475569">${e(m.time)}</span></div>`:""}
        ${m.location&&m.channel==="offline"?`<div><div class="detail-lbl">Location</div><span style="font-size:12px;color:#475569">${e(m.location)}</span></div>`:""}
      </div>
      <div class="detail-grid">
        <div><div class="detail-lbl">Attendees</div><div class="tags-wrap">${ptags||`<span style="color:#94a3b8;font-size:12px">—</span>`}</div></div>
        <div><div class="detail-lbl">Discussion Points</div><div>${discHtml||`<span style="color:#94a3b8;font-size:12px">—</span>`}</div></div>
      </div>
      ${isLatest?`<div class="fu-box ${fuOn?"on":"off"}">
        <div class="fu-row">
          <span class="fu-title">Urgent to Follow Up</span>
          <button class="toggle" style="background:${fuOn?"#2563eb":"#cbd5e1"}" onclick="toggleFU('${m.id}')">
            <span class="toggle-knob" style="left:${fuOn?18:3}px"></span>
          </button>
        </div>
        ${fuOn?`<div class="fu-fields">
          <div><label class="fu-lbl">Follow-up note</label>
          <input class="fu-input" value="${e(m.followUpNote||"")}" placeholder="What needs to be followed up?" oninput="updateFUNote('${m.id}',this.value)"></div>
          <div><label class="fu-lbl">Deadline</label>
          <input type="date" class="fu-input-date" value="${m.followUpDeadline||""}" onchange="updateFUDeadline('${m.id}',this.value)"></div>
        </div>`:""}
      </div>`:""}
      <div class="action-btns">
        <button class="btn-ai" onclick='openAI(records.find(r=>r.id=="${m.id}"))'>📊 Analysis</button>
        <button class="btn-mom" onclick='exportPDF(records.find(r=>r.id=="${m.id}"))'>📄 MoM PDF</button>
        <button class="btn-edit" onclick='editRecord("${m.id}")'>✏ Edit</button>
        <button class="btn-del" onclick='deleteRecord("${m.id}")'>🗑 Delete</button>
      </div>
    </div>`;
  }
  return `<div class="meeting-row">
    <button class="meeting-toggle" onclick="toggleMeeting('${m.id}')">
      ${chPillHTML(m.channel)}
      <span class="meeting-date">${m.date} ${m.contactPerson?`<span style="color:#94a3b8;font-size:11px">· ${e(m.contactPerson)}</span>`:""}</span>
      ${isLatest&&m.urgentFollowUp?fuBadgeHTML(m.followUpDeadline):""}
      <span class="meeting-arrow">${expanded?"▲":"▼"}</span>
    </button>
    ${detail}
  </div>`;
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────
function setTab(t){
  currentTab=t;
  render();
}
function toggleMeeting(id){
  expandedMeetings.has(id)?expandedMeetings.delete(id):expandedMeetings.add(id); render();
}
async function toggleFU(id){
  const r=records.find(x=>x.id===id); if(!r) return;
  const newVal=!r.urgentFollowUp;
  try {
    await api('PATCH','/records/'+id+'/followup',{urgentFollowUp:newVal,followUpNote:r.followUpNote,followUpDeadline:r.followUpDeadline});
    records=records.map(x=>x.id===id?{...x,urgentFollowUp:newVal}:x); render();
  } catch(err){ alert("Gagal update follow-up: "+err.message); }
}
function updateFUNote(id,val){
  records=records.map(r=>r.id===id?{...r,followUpNote:val}:r);
  clearTimeout(updateFUNote._t);
  updateFUNote._t=setTimeout(()=>{
    const r=records.find(x=>x.id===id);
    if(r) api('PATCH','/records/'+id+'/followup',{urgentFollowUp:r.urgentFollowUp,followUpNote:val,followUpDeadline:r.followUpDeadline}).catch(console.error);
  },800);
}
async function updateFUDeadline(id,val){
  records=records.map(r=>r.id===id?{...r,followUpDeadline:val}:r);
  const r=records.find(x=>x.id===id);
  if(r) await api('PATCH','/records/'+id+'/followup',{urgentFollowUp:r.urgentFollowUp,followUpNote:r.followUpNote,followUpDeadline:val}).catch(console.error);
  render();
}
function modalOverlayClick(e,id){ if(e.target===document.getElementById(id))closeModal(id); }
function closeModal(id){ document.getElementById(id).style.display="none"; }

// ── DB MODAL ──────────────────────────────────────────────────────────────────
document.getElementById("btn-db-open").onclick=()=>{ renderDbModal(); document.getElementById("db-modal").style.display="flex"; };
function renderDbModal(){
  document.getElementById("db-count").textContent=companies.length+" companies registered";
  document.getElementById("db-list").innerHTML=companies.map((c,i)=>`
    <div class="db-item">
      <span class="db-num">${i+1}</span>${avatarHTML(c,28)}
      <span class="db-name">${e(c)}</span>
      <button class="db-del" onclick="dbRemove(${i})">✕</button>
    </div>`).join("");
}
async function dbAddNew(){
  const inp=document.getElementById("db-new-input"), n=inp.value.trim();
  if(!n||companies.includes(n))return;
  try {
    await api('POST','/companies',{name:n});
    companies=[...companies,n].sort(); inp.value=""; renderDbModal(); render();
  } catch(err){ alert("Gagal menambah perusahaan: "+err.message); }
}
async function dbRemove(i){
  const name=companies[i];
  try {
    const all=await api('GET','/companies');
    const target=all.find(c=>c.name===name);
    if(target) await api('DELETE','/companies/'+target.id);
    companies.splice(i,1); renderDbModal(); render();
  } catch(err){ alert("Gagal menghapus: "+err.message); }
}

// ── SALES DB ──────────────────────────────────────────────────────────────────
document.getElementById("btn-sales-open").onclick=()=>{ renderSalesModal(); document.getElementById("sales-modal").style.display="flex"; };
function renderSalesModal(){
  document.getElementById("sales-count").textContent=salespeople.length+" sales registered";
  document.getElementById("btn-sales-open").textContent=`Sales DB (${salespeople.length})`;
  document.getElementById("sales-list").innerHTML=salespeople.map((s,i)=>`
    <div class="db-item">
      <span class="db-num">${i+1}</span>
      <div class="avatar" style="${avatarStyle(s,28)}">${initials(s)}</div>
      <span class="db-name">${e(s)}</span>
      <button class="db-del" onclick="salesRemove(${i})">✕</button>
    </div>`).join("");
}
async function salesAddNew(){
  const inp=document.getElementById("sales-new-input"), n=inp.value.trim();
  if(!n||salespeople.includes(n))return;
  try {
    await api('POST','/salespeople',{name:n});
    salespeople=[...salespeople,n].sort(); inp.value=""; renderSalesModal();
  } catch(err){ alert("Gagal menambah sales: "+err.message); }
}
async function salesRemove(i){
  const name=salespeople[i];
  try {
    const all=await api('GET','/salespeople');
    const target=all.find(s=>s.name===name);
    if(target) await api('DELETE','/salespeople/'+target.id);
    salespeople.splice(i,1); renderSalesModal();
  } catch(err){ alert("Gagal menghapus sales: "+err.message); }
}

// Sales picker in form
let salesPickerOpen=false;
function toggleSalesPicker(){
  salesPickerOpen=!salesPickerOpen;
  const dd=document.getElementById("sales-picker-dropdown"); if(!dd)return;
  dd.style.display=salesPickerOpen?"block":"none";
  if(salesPickerOpen)setTimeout(()=>{const qi=document.getElementById("sales-picker-q");if(qi)qi.focus();},50);
}
function closeSalesPicker(ev){
  const wrap=document.getElementById("sales-picker-wrap");
  if(wrap&&!wrap.contains(ev.target)){
    salesPickerOpen=false;
    const dd=document.getElementById("sales-picker-dropdown"); if(dd)dd.style.display="none";
    document.removeEventListener("mousedown",closeSalesPicker);
  }
}
function renderSalesPickerList(){
  const q=(document.getElementById("sales-picker-q")||{}).value||"";
  const filtered=salespeople.filter(s=>s.toLowerCase().includes(q.toLowerCase()));
  const showAdd=q.trim()&&!salespeople.some(s=>s.toLowerCase()===q.trim().toLowerCase());
  const list=document.getElementById("sales-picker-list"); if(!list)return;
  list.innerHTML=`
    ${filtered.length===0&&!showAdd?`<p style="font-size:12px;color:#94a3b8;padding:10px 12px">Not found</p>`:""}
    ${filtered.map(s=>`<div class="picker-item${s===formState.salesRep?" sel":""}" onclick="selectSales('${e(s)}')">
      <div class="avatar" style="${avatarStyle(s,24)}">${initials(s)}</div>${e(s)}
      ${s===formState.salesRep?`<span style="margin-left:auto;font-size:11px;color:#16a34a">✓</span>`:""}
    </div>`).join("")}
    ${showAdd?`<div class="picker-add" onclick="addNewSalesFromPicker('${e(q.trim())}')">
      <div class="picker-add-icon" style="background:#d1fae5;color:#16a34a">+</div>Add "${e(q.trim())}" to Sales DB
    </div>`:""}`;
}
function selectSales(name){
  formState.salesRep=name; salesPickerOpen=false;
  const dd=document.getElementById("sales-picker-dropdown"); if(dd)dd.style.display="none";
  document.removeEventListener("mousedown",closeSalesPicker);
  const trig=document.querySelector("#sales-picker-wrap .picker-trigger span");
  if(trig){trig.textContent=name;trig.style.color="#0f172a";}
  renderSalesPickerList();
}
async function addNewSalesFromPicker(name){
  if(!salespeople.includes(name)){
    try { await api('POST','/salespeople',{name}); } catch(e){}
    salespeople=[...salespeople,name].sort();
  }
  selectSales(name);
  document.getElementById("btn-sales-open").textContent=`Sales DB (${salespeople.length})`;
}

// ── FORM MODAL ────────────────────────────────────────────────────────────────
let formState={}, pickerOpen=false, editingRecordId=null;
function openFormPrefill(company="",contact=""){
  editingRecordId=null;
  document.getElementById("form-modal-title").textContent="Log Communication";
  formState={channel:"zoom",company,contactPerson:contact,date:new Date().toISOString().split("T")[0],time:"",location:"",salesRep:"",participants:[""],discussions:[{topic:"",points:[""]}],urgentFollowUp:false,followUpNote:"",followUpDeadline:""};
  renderFormModal(); document.getElementById("form-modal").style.display="flex";
}
document.getElementById("btn-add-main").onclick=()=>openFormPrefill();

function renderFormModal(){
  const s=formState;
  document.getElementById("form-body").innerHTML=`
    <div>
      <label class="field-lbl">Communication channel</label>
      <div class="ch-grid">${CHANNELS.map(ch=>`<button class="ch-btn${s.channel===ch.id?" sel":""}" onclick="setChannel('${ch.id}')"><span style="font-size:14px">${ch.icon}</span>${ch.label}</button>`).join("")}</div>
    </div>
    <div>
      <label class="field-lbl">Client Company *</label>
      <div class="picker-wrap" id="picker-wrap">
        <div class="picker-trigger" onclick="togglePicker()">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${s.company?"#0f172a":"#94a3b8"}">${s.company||"Select a company..."}</span>
          <span style="font-size:10px;color:#94a3b8;margin-left:8px">▼</span>
        </div>
        <div class="picker-dropdown" id="picker-dropdown" style="display:none">
          <div class="picker-search"><input type="text" id="picker-q" placeholder="Search or type new name..." oninput="renderPickerList()"></div>
          <div class="picker-list" id="picker-list"></div>
        </div>
      </div>
    </div>
    <div class="field-grid">
      <div><label class="field-lbl">Contact Person *</label><input class="field-inp" value="${e(s.contactPerson)}" oninput="formState.contactPerson=this.value" placeholder="Contact name"></div>
      <div>
        <label class="field-lbl">Logged by (Sales) *</label>
        <div class="picker-wrap" id="sales-picker-wrap">
          <div class="picker-trigger" onclick="toggleSalesPicker()" style="min-height:34px">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${s.salesRep?"#0f172a":"#94a3b8"}">${s.salesRep||"Select sales..."}</span>
            <span style="font-size:10px;color:#94a3b8;margin-left:8px">▼</span>
          </div>
          <div class="picker-dropdown" id="sales-picker-dropdown" style="display:none">
            <div class="picker-search"><input type="text" id="sales-picker-q" placeholder="Search or type new name..." oninput="renderSalesPickerList()"></div>
            <div class="picker-list" id="sales-picker-list"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="field-grid">
      <div><label class="field-lbl">Date</label><input type="date" class="field-inp" value="${s.date}" onchange="formState.date=this.value"></div>
      <div><label class="field-lbl">Time</label><input type="time" class="field-inp" value="${s.time}" onchange="formState.time=this.value" placeholder="e.g. 14:00"></div>
    </div>
    ${s.channel==="offline"?`<div><label class="field-lbl">Meeting Location</label><input class="field-inp" value="${e(s.location)}" oninput="formState.location=this.value" placeholder="e.g. Client office, Jakarta"></div>`:""}
    <div>
      <label class="field-lbl">Attendees</label>
      <div class="numbered-list" id="nl-participants">${renderNL("participants")}</div>
    </div>
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <label class="field-lbl" style="margin-bottom:0">Key Discussion Points</label>
        <div style="display:flex;gap:6px">
          <button onclick="openPasteModal()" style="font-size:11px;padding:3px 10px;border-radius:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;cursor:pointer;font-weight:500">✨ Smart Paste</button>
          <button onclick="document.getElementById('import-docx-input').click()" style="font-size:11px;padding:3px 10px;border-radius:6px;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;cursor:pointer;font-weight:500">📄 Upload Notetaker .docx file</button>
          <input type="file" id="import-docx-input" accept=".docx,.doc,.txt" style="display:none" onchange="importDocxFile(this)">
        </div>
      </div>
      <div id="disc-container">${renderDiscussions()}</div>
    </div>
    <div class="fu-box ${s.urgentFollowUp?"on":"off"}" id="fu-form-box">
      <div class="fu-row">
        <span class="fu-title">Urgent to Follow Up</span>
        <button class="toggle" style="background:${s.urgentFollowUp?"#2563eb":"#cbd5e1"}" onclick="toggleFormFU()">
          <span class="toggle-knob" style="left:${s.urgentFollowUp?18:3}px"></span>
        </button>
      </div>
      ${s.urgentFollowUp?`<div class="fu-fields">
        <div><label class="fu-lbl">Follow-up note</label><input class="fu-input" id="fu-note-inp" placeholder="What needs to be followed up?" value="${e(s.followUpNote)}" oninput="formState.followUpNote=this.value"></div>
        <div><label class="fu-lbl">Deadline</label><input type="date" class="fu-input-date" id="fu-date-inp" value="${s.followUpDeadline}" onchange="formState.followUpDeadline=this.value"></div>
      </div>`:""}
    </div>
    <button class="btn-save" onclick="saveRecord()">Save</button>`;
  renderPickerList();
  renderSalesPickerList();
  setTimeout(()=>{
    document.addEventListener("mousedown",closePicker);
    document.addEventListener("mousedown",closeSalesPicker);
  },0);
}

function renderPickerList(){
  const q=(document.getElementById("picker-q")||{}).value||"";
  const filtered=companies.filter(c=>c.toLowerCase().includes(q.toLowerCase()));
  const showAdd=q.trim()&&!companies.some(c=>c.toLowerCase()===q.trim().toLowerCase());
  const list=document.getElementById("picker-list"); if(!list)return;
  list.innerHTML=`
    ${filtered.length===0&&!showAdd?`<p style="font-size:12px;color:#94a3b8;padding:10px 12px">Not found</p>`:""}
    ${filtered.map(c=>`<div class="picker-item${c===formState.company?" sel":""}" onclick="selectCompany('${e(c)}')">
      ${avatarHTML(c,24)}${e(c)}${c===formState.company?`<span style="margin-left:auto;font-size:11px;color:#1d4ed8">✓</span>`:""}
    </div>`).join("")}
    ${showAdd?`<div class="picker-add" onclick="addNewCompanyFromPicker('${e(q.trim())}')">
      <div class="picker-add-icon">+</div>Add "${e(q.trim())}" to database
    </div>`:""}`;
}
function togglePicker(){
  pickerOpen=!pickerOpen;
  const dd=document.getElementById("picker-dropdown"); if(!dd)return;
  dd.style.display=pickerOpen?"block":"none";
  if(pickerOpen)setTimeout(()=>{const qi=document.getElementById("picker-q");if(qi)qi.focus();},50);
}
function closePicker(ev){
  const wrap=document.getElementById("picker-wrap");
  if(wrap&&!wrap.contains(ev.target)){
    pickerOpen=false;
    const dd=document.getElementById("picker-dropdown"); if(dd)dd.style.display="none";
    document.removeEventListener("mousedown",closePicker);
  }
}
function selectCompany(name){
  formState.company=name; pickerOpen=false;
  const dd=document.getElementById("picker-dropdown"); if(dd)dd.style.display="none";
  document.removeEventListener("mousedown",closePicker);
  const trig=document.querySelector(".picker-trigger span");
  if(trig){trig.textContent=name;trig.style.color="#0f172a";}
  renderPickerList();
}
async function addNewCompanyFromPicker(name){
  if(!companies.includes(name)){
    try { await api('POST','/companies',{name}); } catch(e){}
    companies=[...companies,name].sort();
  }
  selectCompany(name); render();
}
function setChannel(id){
  formState.channel=id;
  if(id!=="offline") formState.location="";
  renderFormModal();
  setTimeout(()=>document.addEventListener("mousedown",closePicker),0);
}

function renderNL(field){
  return formState[field].map((v,i)=>`
    <div class="nl-row">
      <span class="nl-num">${i+1}.</span>
      <textarea class="nl-textarea" rows="1"
        placeholder="${i===0?(field==="participants"?"Name and role...":"Type first point, press Enter for next..."):""}"
        oninput="nlUpdate('${field}',${i},this)"
        onkeydown="nlKeydown(event,'${field}',${i})">${e(v)}</textarea>
      ${formState[field].length>1?`<button class="nl-del" onclick="nlRemove('${field}',${i})">✕</button>`:""}
    </div>`).join("")
  +`<button class="nl-add" onclick="nlAdd('${field}')">+ Add row</button>`;
}
function nlUpdate(field,i,el){ formState[field][i]=el.value; el.style.height="auto"; el.style.height=el.scrollHeight+"px"; }
function nlKeydown(ev,field,i){
  if(ev.key==="Enter"){ev.preventDefault();formState[field].splice(i+1,0,"");refreshNL(field);setTimeout(()=>{const r=document.querySelectorAll(`#nl-${field} .nl-textarea`);if(r[i+1])r[i+1].focus();},30);}
  else if(ev.key==="Backspace"&&ev.target.value===""&&formState[field].length>1){ev.preventDefault();formState[field].splice(i,1);refreshNL(field);setTimeout(()=>{const r=document.querySelectorAll(`#nl-${field} .nl-textarea`);if(r[Math.max(0,i-1)])r[Math.max(0,i-1)].focus();},30);}
}
function nlAdd(field){ formState[field].push(""); refreshNL(field); setTimeout(()=>{const r=document.querySelectorAll(`#nl-${field} .nl-textarea`);if(r[r.length-1])r[r.length-1].focus();},30); }
function nlRemove(field,i){ if(formState[field].length<=1){formState[field]=[""];refreshNL(field);return;} formState[field].splice(i,1); refreshNL(field); }
function refreshNL(field){ const el=document.getElementById("nl-"+field); if(el)el.innerHTML=renderNL(field); }
function renderDiscussions(){
  const discs=formState.discussions||[];
  return discs.map((d,di)=>`
    <div class="disc-block">
      <div class="disc-header">
        <span class="disc-num">${di+1}</span>
        <input class="disc-topic-inp" value="${e(d.topic)}" placeholder="Topic title (e.g. Market Insight)" oninput="discUpdateTopic(${di},this.value)">
        ${discs.length>1?`<button class="disc-del-block" onclick="discRemoveBlock(${di})">✕</button>`:""}
      </div>
      <div class="disc-points" id="disc-pts-${di}">
        ${d.points.map((pt,pi)=>`
          <div class="disc-pt-row">
            <span class="disc-pt-num">${pi+1}.</span>
            <textarea class="disc-pt-inp" rows="1"
              placeholder="${pi===0?"Type a point...":""}"
              oninput="discUpdatePt(${di},${pi},this)"
              onkeydown="discKeydown(event,${di},${pi})">${e(pt)}</textarea>
            ${d.points.length>1?`<button class="disc-pt-del" onclick="discRemovePt(${di},${pi})">✕</button>`:""}
          </div>`).join("")}
        <button class="disc-pt-add" onclick="discAddPt(${di})">+ Add point</button>
      </div>
    </div>`).join("")
  +`<button class="disc-add-block" onclick="discAddBlock()">+ Add topic</button>`;
}
function refreshDisc(){ const el=document.getElementById("disc-container"); if(el)el.innerHTML=renderDiscussions(); }
function discUpdateTopic(di,v){ formState.discussions[di].topic=v; }
function discUpdatePt(di,pi,el){ formState.discussions[di].points[pi]=el.value; el.style.height="auto"; el.style.height=el.scrollHeight+"px"; }
function discKeydown(ev,di,pi){
  if(ev.key==="Enter"){ ev.preventDefault(); formState.discussions[di].points.splice(pi+1,0,""); refreshDisc(); setTimeout(()=>{ const rows=document.querySelectorAll(`#disc-pts-${di} .disc-pt-inp`); if(rows[pi+1])rows[pi+1].focus(); },30); }
  else if(ev.key==="Backspace"&&ev.target.value===""&&formState.discussions[di].points.length>1){ ev.preventDefault(); formState.discussions[di].points.splice(pi,1); refreshDisc(); setTimeout(()=>{ const rows=document.querySelectorAll(`#disc-pts-${di} .disc-pt-inp`); if(rows[Math.max(0,pi-1)])rows[Math.max(0,pi-1)].focus(); },30); }
}
function discAddPt(di){ formState.discussions[di].points.push(""); refreshDisc(); setTimeout(()=>{ const rows=document.querySelectorAll(`#disc-pts-${di} .disc-pt-inp`); if(rows[rows.length-1])rows[rows.length-1].focus(); },30); }
function discRemovePt(di,pi){ if(formState.discussions[di].points.length<=1){formState.discussions[di].points=[""];refreshDisc();return;} formState.discussions[di].points.splice(pi,1); refreshDisc(); }
function discAddBlock(){ formState.discussions.push({topic:"",points:[""]}); refreshDisc(); }
function discRemoveBlock(di){ if(formState.discussions.length<=1){formState.discussions=[{topic:"",points:[""]}];refreshDisc();return;} formState.discussions.splice(di,1); refreshDisc(); }

// ── PASTE & FORMAT (SMART RESTRUCTURE) ──────────────────────────────────────
let pasteMode = "smart"; // "smart" or "simple"
let pendingParsed = null;

function setPasteMode(mode){
  pasteMode=mode;
  document.getElementById("paste-mode-ai").className="paste-mode-btn"+(mode==="smart"?" active":"");
  document.getElementById("paste-mode-simple").className="paste-mode-btn"+(mode==="simple"?" active":"");
  document.getElementById("paste-ai-hint").style.display=mode==="smart"?"flex":"none";
  const btn=document.getElementById("btn-do-format");
  btn.textContent=mode==="smart"?"✨ Smart Restructure":"⚡ Quick Format";
  btn.onclick=mode==="smart"?runSmartRestructure:runSimplePaste;
}

function openPasteModal(){
  document.getElementById("paste-input").value="";
  document.getElementById("paste-input").style.display="block";
  document.getElementById("paste-status").textContent="";
  document.getElementById("paste-preview").style.display="none";
  const btn=document.getElementById("btn-do-format");
  btn.disabled=false;
  pendingParsed=null;
  pasteMode="smart";
  setPasteMode("smart");
  document.getElementById("paste-modal").style.display="flex";
}

// ── Simple format (split by blank line + abbreviation fix) ──
function runSimplePaste(){
  const raw=document.getElementById("paste-input").value.trim();
  if(!raw){document.getElementById("paste-status").textContent="Please paste some notes first.";return;}
  const blocks=raw.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const parsed=blocks.map(block=>{
    const lines=block.split(/\n/).map(l=>l.replace(/^[-•·*]\s*/,"").trim()).filter(Boolean);
    if(lines.length===1) return {topic:expandAbbreviations(lines[0]),points:[]};
    return {topic:expandAbbreviations(lines[0]),points:lines.slice(1).map(p=>expandAbbreviations(p))};
  }).filter(d=>d.topic||d.points.length);
  if(!parsed.length){document.getElementById("paste-status").textContent="Could not parse. Separate topics with a blank line.";return;}
  applyParsedToForm(parsed);
}

// ── Abbreviation expander (client-side formal language converter) ──
function expandAbbreviations(text){
  // Word-boundary based replacements (case-insensitive for abbreviations)
  const abbrevMap=[
    [/\btdk\b/gi,"tidak"],[/\bgk\b/gi,"tidak"],[/\bga\b/gi,"tidak"],[/\bgak\b/gi,"tidak"],
    [/\bkarna\b/gi,"karena"],[/\bkrn\b/gi,"karena"],[/\bkrna\b/gi,"karena"],
    [/\blbh\b/gi,"lebih"],
    [/\bjdi\b/gi,"jadi"],[/\bjd\b/gi,"jadi"],
    [/\byg\b/gi,"yang"],
    [/\bdgn\b/gi,"dengan"],[/\bdg\b/gi,"dengan"],
    [/\bdr\b/gi,"dari"],
    [/\butk\b/gi,"untuk"],[/\buat\b/gi,"untuk"],
    [/\bsdh\b/gi,"sudah"],[/\budh\b/gi,"sudah"],[/\budah\b/gi,"sudah"],
    [/\bblm\b/gi,"belum"],[/\bblom\b/gi,"belum"],
    [/\bbs\b/gi,"bisa"],[/\bbsa\b/gi,"bisa"],
    [/\borg\b/gi,"orang"],
    [/\bhrs\b/gi,"harus"],
    [/\bmsh\b/gi,"masih"],
    [/\bskrg\b/gi,"sekarang"],[/\bskr\b/gi,"sekarang"],
    [/\btrs\b/gi,"terus"],[/\btrus\b/gi,"terus"],
    [/\bbrg\b/gi,"barang"],
    [/\bbyk\b/gi,"banyak"],[/\bbnyk\b/gi,"banyak"],
    [/\bdpt\b/gi,"dapat"],
    [/\bspy\b/gi,"supaya"],
    [/\btp\b/gi,"tetapi"],[/\btpi\b/gi,"tetapi"],
    [/\bdlm\b/gi,"dalam"],
    [/\blg\b/gi,"lagi"],[/\blgi\b/gi,"lagi"],
    [/\bbgmn\b/gi,"bagaimana"],[/\bgmn\b/gi,"bagaimana"],[/\bgimana\b/gi,"bagaimana"],
    [/\bmo\b/gi,"ingin"],[/\bmw\b/gi,"ingin"],
    [/\bsm\b/gi,"sama"],
    [/\bama\b/gi,"dengan"],
    [/\btrhdp\b/gi,"terhadap"],
    [/\btsb\b/gi,"tersebut"],
    [/\bttg\b/gi,"tentang"],
    [/\bshg\b/gi,"sehingga"],[/\bshingga\b/gi,"sehingga"],
    [/\bpd\b/gi,"pada"],
    [/\bstlh\b/gi,"setelah"],
    [/\bsblm\b/gi,"sebelum"],
    [/\bkmrn\b/gi,"kemarin"],
    [/\bhrg\b/gi,"harga"],
    [/\bbrp\b/gi,"berapa"],
    [/\bkpn\b/gi,"kapan"],
    [/\bdmn\b/gi,"dimana"],
    [/\bspt\b/gi,"seperti"],
    [/\bkmgknan\b/gi,"kemungkinan"],[/\bmgkn\b/gi,"mungkin"],
    [/\bprlu\b/gi,"perlu"],
    [/\bkdg\b/gi,"kadang"],
    [/\bsbg\b/gi,"sebagai"],
    [/\bthdp\b/gi,"terhadap"],
    [/\bjgn\b/gi,"jangan"],
    [/\bblh\b/gi,"boleh"],
    [/\bbgt\b/gi,"banget"],
    [/\bbngt\b/gi,"banget"],
    [/\bkmdn\b/gi,"kemudian"],
  ];
  let result=text;
  for(const [pattern,replacement] of abbrevMap){
    result=result.replace(pattern,replacement);
  }
  // Capitalize first letter of each sentence
  result=result.replace(/(^|[.!?]\s+)([a-z])/g,(m,p,c)=>p+c.toUpperCase());
  // Capitalize first character
  if(result.length) result=result.charAt(0).toUpperCase()+result.slice(1);
  return result;
}

// ── Smart client-side restructure (fallback if AI fails) ──
function smartClientRestructure(raw){
  const lines=raw.split(/\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return [];

  // Heuristic: detect topic headers vs detail points
  // Topic headers tend to be shorter, start with uppercase/caps, no leading bullet
  // Detail points tend to be longer, start with lowercase or have bullets
  const topics=[];
  let currentTopic=null;

  for(const line of lines){
    const cleaned=line.replace(/^[-•·*▸▹►◆◇→]\s*/,"").replace(/^\d+[.)]\s*/,"").trim();
    if(!cleaned) continue;

    const isLikelyTopic = (
      cleaned.length<60 &&
      !cleaned.match(/^[-•·*]/) &&
      (
        cleaned===cleaned.charAt(0).toUpperCase()+cleaned.slice(1) ||
        cleaned.split(" ").length<=6
      ) &&
      !cleaned.endsWith(",") &&
      (currentTopic===null || lines.indexOf(line)===0 || lines[lines.indexOf(line)-1]?.trim()==="")
    );

    // Check if this looks like a new topic (preceded by blank line in original)
    const origIdx=raw.split(/\n/).findIndex(l=>l.trim()===line);
    const prevLine=origIdx>0?raw.split(/\n/)[origIdx-1]?.trim():"";
    const blankBefore=prevLine==="" || origIdx===0;

    if(blankBefore && cleaned.length<80 && !cleaned.startsWith("-")){
      // Start new topic
      if(currentTopic && (currentTopic.points.length>0 || topics.length===0)){
        topics.push(currentTopic);
      }
      currentTopic={topic:cleaned,points:[]};
    } else if(currentTopic){
      currentTopic.points.push(cleaned);
    } else {
      currentTopic={topic:cleaned,points:[]};
    }
  }
  if(currentTopic) topics.push(currentTopic);

  // If we ended up with everything in one topic with no points, split differently
  if(topics.length===1 && topics[0].points.length===0){
    // Just make each line a point under a generic topic
    return [{topic:"Discussion Points",points:lines.map(l=>l.replace(/^[-•·*▸▹►◆◇→]\s*/,"").replace(/^\d+[.)]\s*/,"").trim()).filter(Boolean)}];
  }

  // Merge topics that have no points into the next one, or keep as-is
  const merged=[];
  for(let i=0;i<topics.length;i++){
    if(topics[i].points.length===0 && i+1<topics.length){
      // Topic with no points — might be a header line, merge into next
      topics[i+1].topic=topics[i].topic;
    } else {
      merged.push(topics[i]);
    }
  }

  return merged.length?merged:topics;
}

// ── Smart Restructure (fully client-side) ──
function runSmartRestructure(){
  const raw=document.getElementById("paste-input").value.trim();
  if(!raw){document.getElementById("paste-status").textContent="Please paste some notes first.";return;}

  const btn=document.getElementById("btn-do-format");
  btn.disabled=true;
  btn.textContent="⏳ Memproses...";
  document.getElementById("paste-status").textContent="✍️ Fixing abbreviations & restructuring...";

  setTimeout(()=>{
    try {
      const restructured=smartClientRestructure(raw);
      if(!restructured.length) throw new Error("empty");

      pendingParsed=restructured.map(d=>({
        topic:expandAbbreviations(d.topic),
        points:d.points.length?d.points.map(p=>expandAbbreviations(p)):[""]
      }));
      showPreview(pendingParsed);
      document.getElementById("paste-status").textContent=`✅ ${pendingParsed.length} topics structured — review then click Apply`;
      btn.disabled=false;
      btn.textContent="✅ Apply to Form";
      btn.onclick=applyPendingToForm;
    } catch(err){
      console.error("Restructure error:",err);
      document.getElementById("paste-status").textContent="⚠️ Failed to process. Try separating topics with a blank line.";
      btn.disabled=false;
      btn.textContent="✨ Try Again";
      btn.onclick=runSmartRestructure;
    }
  },300);
}

function showPreview(parsed){
  const previewEl=document.getElementById("paste-preview");
  const contentEl=document.getElementById("paste-preview-content");
  document.getElementById("paste-input").style.display="none";
  previewEl.style.display="block";

  contentEl.innerHTML=parsed.map((d,i)=>`
    <div class="preview-topic">
      <div class="preview-topic-title"><span class="preview-topic-num">${i+1}</span>${e(d.topic)}</div>
      ${(d.points||[]).filter(Boolean).map(pt=>`<div class="preview-point">${e(pt)}</div>`).join("")}
    </div>`).join("");
}

function applyPendingToForm(){
  if(!pendingParsed||!pendingParsed.length) return;
  applyParsedToForm(pendingParsed);
  pendingParsed=null;
}

function applyParsedToForm(parsed){
  const normalized=parsed.map(d=>({
    topic:d.topic||"",
    points:d.points&&d.points.length?d.points:[""]
  }));
  const existing=formState.discussions.filter(d=>d.topic||d.points.some(Boolean));
  formState.discussions=existing.length?[...existing,...normalized]:normalized;
  refreshDisc();
  document.getElementById("paste-modal").style.display="none";
}

// ── IMPORT .DOCX (AI Notetaker like Plaud) ──────────────────────────────────
async function importDocxFile(input){
  const file=input.files?.[0];
  if(!file) return;
  input.value=""; // reset so same file can be re-imported

  // Show loading indicator in discussion area
  const discEl=document.getElementById("disc-container");
  if(discEl) discEl.innerHTML='<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">📄 Reading file...</div>';

  try {
    let rawText="";

    if(file.name.endsWith(".txt")){
      rawText=await file.text();
    } else {
      // Use mammoth.js for .docx
      const arrayBuffer=await file.arrayBuffer();
      const result=await mammoth.extractRawText({arrayBuffer});
      rawText=result.value||"";
    }

    if(!rawText.trim()){
      alert("File is empty or cannot be read.");
      refreshDisc();
      return;
    }

    // Parse the MoM content into structured topics
    const parsed=parseMoMContent(rawText);

    if(parsed.length){
      // Apply abbreviation expansion
      const cleaned=parsed.map(d=>({
        topic:expandAbbreviations(d.topic),
        points:d.points.length?d.points.map(p=>expandAbbreviations(p)):[""]
      }));

      const existing=formState.discussions.filter(d=>d.topic||d.points.some(Boolean));
      formState.discussions=existing.length?[...existing,...cleaned]:cleaned;
    } else {
      // Fallback: use smart restructure on full text
      const restructured=smartClientRestructure(rawText);
      if(restructured.length){
        const cleaned=restructured.map(d=>({
          topic:expandAbbreviations(d.topic),
          points:d.points.length?d.points.map(p=>expandAbbreviations(p)):[""]
        }));
        formState.discussions=cleaned;
      } else {
        alert("Cannot parse this file. Try using Smart Paste.");
        refreshDisc();
        return;
      }
    }

    refreshDisc();

    // Try to auto-fill date from content
    const dateMatch=rawText.match(/(?:Date|Tanggal)[:\s]*(\w+\s+\d{1,2},?\s+\d{4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
    if(dateMatch){
      try {
        const d=new Date(dateMatch[1]);
        if(!isNaN(d)){
          formState.date=d.toISOString().split("T")[0];
          renderFormModal();
        }
      } catch(e){}
    }

  } catch(err){
    console.error("Import error:",err);
    alert("Failed to read file: "+err.message);
    refreshDisc();
  }
}

function parseMoMContent(text){
  const lines=text.split(/\n/).map(l=>l.trim());
  const topics=[];
  let currentTopic=null;

  // Patterns for section headers (numbered or bold markdown)
  const sectionPattern=/^(?:\*\*)?(\d+\.?\s+.+?)(?:\*\*)?$/;
  const boldPattern=/^\*\*(.+?)\*\*$/;
  const numberedSection=/^(\d+)\.\s+(.+)/;

  // Skip header lines (title, date, duration, objective)
  let contentStarted=false;
  const skipWords=["meeting minutes","date:","duration:","objective:","tanggal:","durasi:","tujuan:","notulen","ringkasan"];

  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!line) continue;

    const lower=line.toLowerCase().replace(/\*\*/g,"").trim();

    // Skip header/meta lines at the start
    if(!contentStarted){
      if(skipWords.some(sw=>lower.startsWith(sw))||lower.length<3) continue;
      // Check if this is a section header
      if(numberedSection.test(line.replace(/\*\*/g,""))){
        contentStarted=true;
      } else if(lower.length<80 && !lower.startsWith("-") && !lower.startsWith("•")){
        // Could still be a preamble line, skip
        continue;
      } else {
        contentStarted=true;
      }
    }

    const cleanLine=line.replace(/\*\*/g,"").trim();

    // Detect section headers
    const numMatch=cleanLine.match(/^(\d+)\.\s+(.+)/);
    const isShortBold=boldPattern.test(line) && line.replace(/\*\*/g,"").length<80;
    const isAllCapsShort=cleanLine===cleanLine.toUpperCase() && cleanLine.length>3 && cleanLine.length<60 && !cleanLine.startsWith("-");

    if(numMatch){
      // Numbered section header like "1. Business Model & Operations"
      if(currentTopic) topics.push(currentTopic);
      currentTopic={topic:numMatch[2].replace(/\*\*/g,"").trim(),points:[]};
      continue;
    }

    if((isShortBold||isAllCapsShort) && !cleanLine.startsWith("-") && !cleanLine.startsWith("•")){
      // Bold or ALL CAPS sub-header — treat as new topic
      if(currentTopic&&(currentTopic.points.length>0||topics.length===0)){
        topics.push(currentTopic);
      }
      currentTopic={topic:cleanLine,points:[]};
      continue;
    }

    // Bullet points or content lines
    if(currentTopic){
      const bulletClean=cleanLine.replace(/^[-•·*▸►→]\s*/,"").replace(/^\d+[.)]\s*/,"").trim();
      if(bulletClean.length>2){
        // Skip table formatting lines
        if(bulletClean.startsWith("---")||bulletClean.startsWith("===")||bulletClean.startsWith("***")) continue;
        // Skip if it looks like a table header separator
        if(/^[-|:]+$/.test(bulletClean)) continue;
        currentTopic.points.push(bulletClean);
      }
    } else {
      // No current topic yet, start one
      const bulletClean=cleanLine.replace(/^[-•·*▸►→]\s*/,"").trim();
      if(bulletClean.length>5){
        currentTopic={topic:"Catatan",points:[bulletClean]};
      }
    }
  }

  if(currentTopic&&(currentTopic.topic||currentTopic.points.length)) topics.push(currentTopic);

  // Merge topics with no points into next if possible, and filter empty
  const merged=[];
  for(let i=0;i<topics.length;i++){
    if(topics[i].points.length===0&&i+1<topics.length){
      topics[i+1].topic=topics[i].topic;
    } else if(topics[i].points.length>0){
      merged.push(topics[i]);
    }
  }

  // If action items / next steps found, keep as separate topic
  return merged.length?merged:topics.filter(t=>t.points.length>0);
}

function toggleFormFU(){
  formState.urgentFollowUp=!formState.urgentFollowUp;
  const box=document.getElementById("fu-form-box"); if(!box)return;
  const s=formState;
  box.className=`fu-box ${s.urgentFollowUp?"on":"off"}`;
  box.innerHTML=`
    <div class="fu-row">
      <span class="fu-title">Urgent to Follow Up</span>
      <button class="toggle" style="background:${s.urgentFollowUp?"#2563eb":"#cbd5e1"}" onclick="toggleFormFU()">
        <span class="toggle-knob" style="left:${s.urgentFollowUp?18:3}px"></span>
      </button>
    </div>
    ${s.urgentFollowUp?`<div class="fu-fields">
      <div><label class="fu-lbl">Follow-up note</label><input class="fu-input" placeholder="What needs to be followed up?" value="${e(s.followUpNote)}" oninput="formState.followUpNote=this.value"></div>
      <div><label class="fu-lbl">Deadline</label><input type="date" class="fu-input-date" value="${s.followUpDeadline}" onchange="formState.followUpDeadline=this.value"></div>
    </div>`:""}`;
}
async function saveRecord(){
  if(!formState.company||!formState.contactPerson||!formState.salesRep){alert("Company, Contact Person, and Logged by (Sales) are required.");return;}
  const cleaned={...formState,participants:formState.participants.filter(Boolean),discussions:(formState.discussions||[]).map(d=>({topic:d.topic,points:(d.points||[]).filter(Boolean)})).filter(d=>d.topic||d.points.length)};
  try {
    if(editingRecordId){
      const updated=await api('POST','/records',{...cleaned,id:editingRecordId});
      records=records.map(r=>r.id===editingRecordId?updated:r);
      editingRecordId=null;
    } else {
      const created=await api('POST','/records',{...cleaned,id:Date.now().toString()});
      records=[created,...records];
    }
    closeModal("form-modal"); render();
  } catch(err){ alert("Gagal menyimpan: "+err.message); }
}

function editRecord(id){
  const r=records.find(x=>x.id===id); if(!r) return;
  editingRecordId=id;
  document.getElementById("form-modal-title").textContent="✏ Edit Communication";
  formState={
    channel:r.channel||"zoom", company:r.company||"", contactPerson:r.contactPerson||"",
    date:r.date||"", time:r.time||"", location:r.location||"", salesRep:r.salesRep||"",
    participants:r.participants&&r.participants.length?[...r.participants]:[""],
    discussions:r.discussions&&r.discussions.length?r.discussions.map(d=>({topic:d.topic||"",points:d.points&&d.points.length?[...d.points]:[""]})):[{topic:"",points:[""]}],
    urgentFollowUp:!!r.urgentFollowUp, followUpNote:r.followUpNote||"", followUpDeadline:r.followUpDeadline||""
  };
  renderFormModal(); document.getElementById("form-modal").style.display="flex";
}

async function deleteRecord(id){
  if(!confirm("Hapus communication ini? Tindakan ini tidak bisa dibatalkan.")) return;
  try {
    await api('DELETE','/records/'+id);
    records=records.filter(r=>r.id!==id);
    expandedMeetings.delete(id);
    render();
  } catch(err){ alert("Gagal menghapus: "+err.message); }
}

// ── PDF EXPORT ────────────────────────────────────────────────────────────────
function sanitizeFilename(s){ return s.replace(/[\/\\:*?"<>|]/g,"-").replace(/\s+/g," ").trim(); }
function pdfSafe(s){ return String(s||"").replace(/%/g,"(%)"); }

function exportPDF(record) {
  if (!record) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const ch = CHANNELS.find(c=>c.id===record.channel) || CHANNELS[0];
  const pageW=210, mL=20, mR=20, mT=20, mB=20;
  const contentW = pageW - mL - mR;
  const pageH = 297, bodyBot = pageH - mB - 10;
  let y = mT;

  // ── helpers ───────────────────────────────────────────────────────────────
  const DARK  = [15,23,42];
  const BLUE  = [29,78,216];
  const LGRAY = [107,114,128];
  const XGRAY = [229,231,235];
  const WHITE = [255,255,255];

  function checkPage(need) {
    if (y + need > bodyBot) { doc.addPage(); y = mT; drawTableHeader(); }
  }

  function hline(yy, r,g,b, lw=0.3) {
    doc.setDrawColor(r,g,b); doc.setLineWidth(lw);
    doc.line(mL, yy, mL+contentW, yy);
  }

  // ── PAGE HEADER (title block) ─────────────────────────────────────────────
  // "MINUTES OF MEETING" title
  doc.setFont("helvetica","bold");
  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text("MINUTES OF MEETING", mL+contentW/2, y, {align:"center"});
  y += 7;

  // Company name as subtitle
  doc.setFont("helvetica","normal");
  doc.setFontSize(11);
  doc.setTextColor(...LGRAY);
  doc.text(pdfSafe(record.company), mL+contentW/2, y, {align:"center"});
  y += 2;

  // Full-width rule
  hline(y+2, ...BLUE, 0.8);
  y += 7;

  // ── META INFO block ───────────────────────────────────────────────────────
  const metaFS = 9.5;
  const col1x = mL, col2x = mL + contentW*0.52;
  const rowH = 6.5;

  function metaRow(label, value, x) {
    doc.setFont("helvetica","bold"); doc.setFontSize(metaFS); doc.setTextColor(...LGRAY);
    doc.text(label + " :", x, y);
    doc.setFont("helvetica","normal"); doc.setTextColor(...DARK);
    doc.text(pdfSafe(value || "—"), x + doc.getTextWidth(label + " :") + 2, y);
  }

  metaRow("DATE", record.date + (record.time ? "  " + record.time : ""), col1x);
  metaRow("CHANNEL", ch.label, col2x);
  y += rowH;
  metaRow("CONTACT", record.contactPerson, col1x);
  metaRow("LOGGED BY", record.salesRep || "—", col2x);
  y += rowH;
  if (record.channel === "offline" && record.location) {
    metaRow("LOCATION", record.location, col1x);
    y += rowH;
  }
  y += 3;

  // ── ATTENDEES block ───────────────────────────────────────────────────────
  doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(...LGRAY);
  doc.text("ATTENDEES :", mL, y); y += 5;

  const atts = (record.participants || []).filter(Boolean);
  if (atts.length) {
    doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
    atts.forEach(p => {
      doc.text("-  " + pdfSafe(p), mL+3, y); y += 5.5;
    });
  } else {
    doc.setFont("helvetica","italic"); doc.setFontSize(9); doc.setTextColor(...LGRAY);
    doc.text("—", mL+3, y); y += 5.5;
  }
  y += 3;

  // ── SUMMARY table ─────────────────────────────────────────────────────────
  // Column widths
  const colNo    = 10;
  const colTopic = 42;
  const colPts   = contentW - colNo - colTopic;

  // Table header draw function (reused on new pages)
  function drawTableHeader() {
    doc.setFillColor(29,78,216);
    doc.rect(mL, y, contentW, 7, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...WHITE);
    doc.text("No",            mL + 3,              y+5);
    doc.text("Topic",         mL + colNo + 3,      y+5);
    doc.text("Points",        mL + colNo+colTopic+3, y+5);
    y += 7;
  }

  drawTableHeader();

  // Table rows — discussions (each has topic + bullet points)
  const discs = (record.discussions || []).filter(d => d.topic || (d.points||[]).some(Boolean));
  const rowPadT = 2.5, rowPadB = 3, lineH = 5, bulletIndent = 4;

  discs.forEach((disc, idx) => {
    const pts = (disc.points || []).filter(Boolean);
    // measure total height: topic line(s) + all bullet lines
    const topicLines = disc.topic
      ? doc.setFont("helvetica","bold").setFontSize(9) && doc.splitTextToSize(pdfSafe(disc.topic), colTopic - 6)
      : [];
    // bullet lines per point
    const allBulletLines = pts.map(pt => {
      doc.setFont("helvetica","normal"); doc.setFontSize(9);
      return doc.splitTextToSize(pdfSafe(pt), colPts - bulletIndent - 4);
    });
    const totalBulletLines = allBulletLines.reduce((sum,bl)=>sum+bl.length, 0);
    const rowH2 = rowPadT
      + Math.max(topicLines.length, 1) * lineH
      + (pts.length ? totalBulletLines * lineH + pts.length * 1.5 : 0)
      + rowPadB;

    checkPage(rowH2 + 2);

    // Alternating row bg
    if (idx % 2 === 0) { doc.setFillColor(248,250,252); doc.rect(mL, y, contentW, rowH2, "F"); }

    // Vertical dividers
    doc.setDrawColor(...XGRAY); doc.setLineWidth(0.2);
    doc.line(mL+colNo, y, mL+colNo, y+rowH2);
    doc.line(mL+colNo+colTopic, y, mL+colNo+colTopic, y+rowH2);
    hline(y+rowH2, ...XGRAY, 0.2);

    // No column
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...LGRAY);
    doc.text(String(idx+1), mL+colNo/2, y+rowPadT+lineH*0.7, {align:"center"});

    // Topic column
    if (disc.topic) {
      const tLines = doc.setFont("helvetica","bold").setFontSize(9)
        && doc.splitTextToSize(disc.topic, colTopic-6);
      doc.setTextColor(30,58,138);
      tLines.forEach((tl,ti) => doc.text(pdfSafe(tl), mL+colNo+3, y+rowPadT+lineH*(0.7+ti)));
    }

    // Points column — bullet list
    let py = y + rowPadT;
    allBulletLines.forEach((bLines, bi) => {
      const bx = mL+colNo+colTopic+bulletIndent;
      // bullet character
      doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(...DARK);
      doc.text("-", mL+colNo+colTopic+1.5, py+lineH*0.7);
      bLines.forEach((bl,li) => doc.text(pdfSafe(bl), bx, py+lineH*(0.7+li)));
      py += bLines.length * lineH + 1.5;
    });

    y += rowH2;
  });

  // Empty state
  if (!discs.length) {
    doc.setFont("helvetica","italic"); doc.setFontSize(9); doc.setTextColor(...LGRAY);
    doc.text("No discussion points recorded.", mL+colNo+colTopic+3, y+6);
    y += 10;
  }

  // ── NEXT ACTION row (follow-up) ───────────────────────────────────────────
  if (record.urgentFollowUp && record.followUpNote) {
    checkPage(20);
    const fuLines = doc.setFont("helvetica","normal").setFontSize(9)
      && doc.splitTextToSize(pdfSafe(record.followUpNote), colPts - 6);
    const fuRowH = rowPadT + fuLines.length*lineH + rowPadB + (record.followUpDeadline?5:0);

    // Header row for Next Action
    doc.setFillColor(29,78,216);
    doc.rect(mL, y, contentW, 7, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...WHITE);
    doc.text("No",              mL+3,                y+5);
    doc.text("Next Action",     mL+colNo+3,          y+5);
    doc.text("Details",         mL+colNo+colTopic+3, y+5);
    y += 7;

    // Row
    doc.setFillColor(255,251,235);
    doc.rect(mL, y, contentW, fuRowH, "F");
    doc.setDrawColor(...XGRAY); doc.setLineWidth(0.2);
    doc.line(mL+colNo, y, mL+colNo, y+fuRowH);
    doc.line(mL+colNo+colTopic, y, mL+colNo+colTopic, y+fuRowH);
    hline(y+fuRowH, ...XGRAY, 0.2);

    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...LGRAY);
    doc.text("1", mL+colNo/2, y+rowPadT+lineH*0.7, {align:"center"});

    doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(180,83,9);
    doc.text("Follow-Up", mL+colNo+3, y+rowPadT+lineH*0.7);

    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(146,64,14);
    fuLines.forEach((fl,fi) => doc.text(pdfSafe(fl), mL+colNo+colTopic+3, y+rowPadT+lineH*(0.7+fi)));

    if (record.followUpDeadline) {
      const dlY = y + rowPadT + fuLines.length*lineH + 1.5;
      doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(180,83,9);
      doc.text(pdfSafe(`Deadline: ${record.followUpDeadline}`), mL+colNo+colTopic+3, dlY);
    }
    y += fuRowH;
  }

  y += 6;

  // ── TABLE outer border ────────────────────────────────────────────────────
  // (drawn last so it sits on top cleanly — omit if too complex; border done via lines above)

  // ── FOOTER on every page ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  const today = new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
  for (let p=1; p<=totalPages; p++) {
    doc.setPage(p);
    const fy = pageH - mB + 2;
    doc.setDrawColor(...XGRAY); doc.setLineWidth(0.3);
    doc.line(mL, fy-3, mL+contentW, fy-3);
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(180,180,180);
    doc.text(`Client Interaction Log  ·  Auto-generated  ·  ${today}`, mL, fy+1);
    doc.text(`${p} | P a g e`, mL+contentW, fy+1, {align:"right"});
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = sanitizeFilename(`${record.company} - ${record.date}`) + ".pdf";
  doc.save(filename);
}

// ── AI MODAL (CLIENT-SIDE ANALYSIS) ──────────────────────────────────────────
function openAI(record){
  if(!record)return;
  analyzingRecord=record;
  const company=record.company;
  const compRecords=records.filter(r=>r.company===company);
  const compComplaints=complaints.filter(c=>c.company===company);
  document.getElementById("ai-modal-sub").textContent=`${company} · ${compRecords.length} komunikasi${compComplaints.length?" · "+compComplaints.length+" complaint":""}`;
  document.getElementById("ai-modal-body").innerHTML=`<button class="btn-start" onclick="runAI()">Start Analysis</button>`;
  document.getElementById("ai-modal").style.display="flex";
}
function runAI(){
  const m=analyzingRecord; if(!m)return;
  const btn=document.querySelector("#ai-modal-body .btn-start");
  if(btn){btn.disabled=true;btn.textContent="Analysing...";}

  setTimeout(()=>{
    try {
      const r=clientSideAnalysis(m);
      const ss={"positive":{bg:"#dcfce7",c:"#15803d"},"neutral":{bg:"#f1f5f9",c:"#475569"},"needs attention":{bg:"#fee2e2",c:"#dc2626"}}[r.sentiment]||{bg:"#f1f5f9",c:"#475569"};
      document.getElementById("ai-modal-body").innerHTML=`
        <div class="ai-result">
          <div class="ai-top">
            <span class="sentiment-badge" style="background:${ss.bg};color:${ss.c}">${r.sentiment}</span>
            <div class="ai-prob"><span class="ai-prob-val">${r.dealProbability}%</span><div class="ai-prob-lbl">engagement score</div></div>
          </div>
          <div class="ai-bar"><div class="ai-bar-fill" style="width:${r.dealProbability}%"></div></div>
          ${r.summary?`<div style="background:#f8fafc;border-radius:8px;padding:10px 12px;margin-bottom:4px">
            <div style="font-size:11px;font-weight:500;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Overview</div>
            <p style="font-size:12px;color:#475569;line-height:1.6;margin:0">${r.summary}</p>
          </div>`:""}
          <p class="ai-analysis">${r.analysis}</p>
          ${r.topKeywords.length?`<div style="margin-bottom:4px"><div class="ai-section-lbl">Topik Utama Dibahas</div><div style="display:flex;flex-wrap:wrap;gap:4px">${r.topKeywords.map(k=>`<span style="font-size:11px;background:#eff6ff;color:#1d4ed8;padding:3px 8px;border-radius:6px">${k}</span>`).join("")}</div></div>`:""}
          <div><div class="ai-section-lbl">Recommendations</div>
            ${r.recommendations.map((rec,i)=>`<div class="rec-item"><span class="rec-num">${i+1}.</span>${rec}</div>`).join("")}
          </div>
          ${r.riskFactors.length?`<div><div class="ai-section-lbl" style="color:#dc2626">Risk Factors</div>${r.riskFactors.map(rf=>`<div class="risk-item">${rf}</div>`).join("")}</div>`:""}
          <button class="btn-retry" onclick="openAI(analyzingRecord)">Re-run analysis</button>
        </div>`;
    } catch(err){
      console.error("Analysis error:",err);
      document.getElementById("ai-modal-body").innerHTML=`<p style="font-size:13px;color:#dc2626">Analysis error.</p><button class="btn-start" style="margin-top:12px" onclick="runAI()">Retry</button>`;
    }
  },400);
}

function clientSideAnalysis(m){
  const company=m.company;
  const compRecords=records.filter(r=>r.company===company).sort((a,b)=>a.date.localeCompare(b.date));
  const compComplaints=complaints.filter(c=>c.company===company);
  const openComplaints=compComplaints.filter(c=>c.status!=="resolved");
  const totalComms=compRecords.length;

  // ── Aggregate all text from ALL communications ──
  let allText="";
  let totalTopics=0, totalPoints=0, totalParticipants=new Set();
  const channelUsage={};
  const allDiscussionTopics=[];

  compRecords.forEach(r=>{
    (r.discussions||[]).forEach(d=>{
      const pts=(d.points||[]).join(" ");
      allText+=" "+(d.topic||"")+" "+pts;
      if(d.topic) allDiscussionTopics.push(d.topic);
      totalTopics++;
      totalPoints+=(d.points||[]).filter(Boolean).length;
    });
    allText+=" "+(r.followUpNote||"");
    (r.participants||[]).filter(Boolean).forEach(p=>totalParticipants.add(p));
    channelUsage[r.channel]=(channelUsage[r.channel]||0)+1;
  });

  // Add complaint text
  compComplaints.forEach(c=>{
    allText+=" "+c.detail+" "+c.responses.map(r=>r.note).join(" ");
  });
  allText=allText.toLowerCase();

  // ── Keyword-based sentiment detection ──
  const posWords=["deal","agreement","agree","setuju","order","po","purchase","confirm","approve","interest","minat","tertarik","bagus","baik","positif","ok","oke","siap","ready","lanjut","proceed","partnership","kerjasama","diskon","discount","opportunity","peluang","potensi","potential","berhasil","sukses","success","closing","signed","won","project","proyek","tender","kontrak","contract"];
  const negWords=["complaint","complain","keluhan","masalah","problem","issue","gagal","fail","cancel","batal","reject","tolak","delay","terlambat","late","overdue","sulit","difficult","mahal","expensive","kompetitor","competitor","rugi","loss","risiko","risk","pending","stuck","blocked","urgent","darurat","kecewa","disappointed","jelek","buruk","bad","poor","drop","turun","defect","cacat","retur","return","claim","damaged","rusak"];
  const urgentWords=["urgent","segera","asap","deadline","overdue","darurat","penting","critical","immediately"];

  let posScore=0, negScore=0, urgentScore=0;
  posWords.forEach(w=>{const matches=allText.split(w).length-1;posScore+=matches;});
  negWords.forEach(w=>{const matches=allText.split(w).length-1;negScore+=matches;});
  urgentWords.forEach(w=>{if(allText.includes(w))urgentScore++;});

  // Follow-up urgency from latest record
  const latest=compRecords[compRecords.length-1];
  if(latest&&latest.urgentFollowUp) urgentScore+=2;
  if(latest&&latest.followUpDeadline){
    const days=daysUntil(latest.followUpDeadline);
    if(days!==null&&days<0) urgentScore+=3;
    else if(days!==null&&days<=3) urgentScore+=1;
  }

  // Complaint impact
  negScore+=openComplaints.length*3;
  if(compComplaints.some(c=>c.priority==="critical")) urgentScore+=3;
  if(compComplaints.some(c=>c.priority==="high")) urgentScore+=1;

  // ── Engagement score ──
  let engagement=40;
  engagement+=Math.min(posScore*4,25);
  engagement-=Math.min(negScore*3,20);
  engagement+=Math.min(totalComms*3,15); // more comms = more engagement
  engagement+=Math.min(totalTopics*2,10);
  engagement+=Math.min(totalPoints,10);
  engagement+=Math.min(totalParticipants.size*2,10);
  engagement-=Math.min(openComplaints.length*8,20);
  if(Object.values(channelUsage).some(v=>v>=2)) engagement+=5; // repeat contact
  engagement=Math.max(5,Math.min(95,engagement));

  // ── Sentiment ──
  let sentiment="neutral";
  if(posScore>negScore+2 && urgentScore<3 && openComplaints.length===0) sentiment="positive";
  else if(negScore>posScore || urgentScore>=3 || openComplaints.length>=2) sentiment="needs attention";

  // ── Extract top keywords/topics ──
  const topKeywords=[];
  const topicFreq={};
  allDiscussionTopics.forEach(t=>{
    const key=t.trim();
    if(key) topicFreq[key]=(topicFreq[key]||0)+1;
  });
  Object.entries(topicFreq).sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([k])=>topKeywords.push(k));

  // ── Communication frequency ──
  const dates=compRecords.map(r=>new Date(r.date)).sort((a,b)=>a-b);
  let avgGapDays=null;
  if(dates.length>=2){
    const totalDays=(dates[dates.length-1]-dates[0])/(1000*60*60*24);
    avgGapDays=Math.round(totalDays/(dates.length-1));
  }
  const lastCommDate=compRecords.length?compRecords[compRecords.length-1].date:"—";
  const daysSinceLast=compRecords.length?Math.floor((new Date()-new Date(lastCommDate))/(1000*60*60*24)):null;

  // ── Most used channel ──
  const topChannel=Object.entries(channelUsage).sort((a,b)=>b[1]-a[1])[0];
  const topChLabel=topChannel?CHANNELS.find(c=>c.id===topChannel[0])?.label||topChannel[0]:"—";

  // ── Summary ──
  let summary=`${totalComms} communications recorded`;
  if(totalParticipants.size>0) summary+=` dengan ${totalParticipants.size} unique contacts`;
  summary+=`. Most used channel: ${topChLabel}.`;
  if(avgGapDays!==null) summary+=` Average frequency: every ${avgGapDays} days.`;
  if(daysSinceLast!==null) summary+=` Last contact: ${daysSinceLast===0?"today":daysSinceLast+" days ago"}.`;
  if(openComplaints.length>0) summary+=` ⚠ ${openComplaints.length} open complaint(s).`;

  // ── Analysis text ──
  let analysis="";
  if(totalComms===1){
    const ch=CHANNELS.find(c=>c.id===m.channel)||CHANNELS[0];
    analysis=`Only 1 communication via ${ch.label} tercatat.`;
    if(totalTopics>0) analysis+=` Discussed ${totalTopics} topics with ${totalPoints} points.`;
  } else {
    analysis=`From ${totalComms} interactions,`;
    if(posScore>negScore) analysis+=` majority of conversations were positive (${posScore} positive signals vs ${negScore} negative).`;
    else if(negScore>posScore) analysis+=` terdeteksi lebih banyak sinyal negative (${negScore}) compared to positive (${posScore}).`;
    else analysis+=` sinyal positif dan negative relatif seimbang.`;
  }
  if(openComplaints.length>0){
    analysis+=` Needs attention: ${openComplaints.length} complaint(s) unresolved.`;
  }

  // ── Recommendations ──
  const recs=[];
  if(latest&&latest.urgentFollowUp&&latest.followUpDeadline){
    const days=daysUntil(latest.followUpDeadline);
    if(days!==null&&days<0) recs.push(`Follow-up is overdue by ${Math.abs(days)} days — take action immediately.`);
    else if(days!==null&&days<=3) recs.push(`Follow-up deadline in ${days} days — prioritize.`);
  }
  if(openComplaints.length>0) recs.push(`Resolve ${openComplaints.length} open complaint(s) before continuing new business discussions.`);
  if(daysSinceLast!==null&&daysSinceLast>14) recs.push(`Already ${daysSinceLast} days without contact — schedule communication soon.`);
  if(totalComms>=3&&avgGapDays!==null&&avgGapDays>21) recs.push("Communication frequency is low — increase contact intensity.");
  if(totalComms===1) recs.push("Only 1 communication — jadwalkan follow-up untuk memperkuat hubungan.");
  if(totalParticipants.size<=1&&totalComms>1) recs.push("Expand contacts — involve other decision makers at the company.");
  if(negScore>posScore&&posScore>0) recs.push("Sinyal negative lebih banyak — persiapkan strategi penanganan.");
  if(posScore>negScore+3) recs.push("Very positive momentum — accelerate closing or next stage.");
  if(totalTopics>5) recs.push("Many topics discussed — create a summary document for internal alignment.");
  if(!recs.length) recs.push("Continue regular communication to maintain the relationship.");

  // ── Risk Factors ──
  const risks=[];
  if(latest&&latest.urgentFollowUp&&latest.followUpDeadline){
    const days=daysUntil(latest.followUpDeadline);
    if(days!==null&&days<0) risks.push(`Follow-up overdue by ${Math.abs(days)} hari`);
  }
  if(openComplaints.length>0) risks.push(`${openComplaints.length} open complaint(s) — risk of losing trust`);
  if(compComplaints.some(c=>c.priority==="critical")) risks.push("CRITICAL complaint remains unresolved");
  if(daysSinceLast!==null&&daysSinceLast>30) risks.push(`No contact for ${daysSinceLast} hari — churn risk`);
  if(negScore>=posScore+3) risks.push("Dominasi sinyal negative — perlu intervensi segera");
  if(allText.includes("kompetitor")||allText.includes("competitor")) risks.push("Competitor discussion detected — potential switching risk");
  if(allText.includes("cancel")||allText.includes("batal")) risks.push("Cancellation signals detected");
  if(allText.includes("harga")||allText.includes("mahal")||allText.includes("price")) risks.push("Price sensitivity detected");
  if(allText.includes("delay")||allText.includes("terlambat")||allText.includes("pending")) risks.push("Delay / pending issues detected");

  return {sentiment,dealProbability:engagement,summary,analysis,topKeywords,recommendations:recs.slice(0,5),riskFactors:risks.slice(0,5)};
}

// ── COMPLAINT SYSTEM ─────────────────────────────────────────────────────────
const PRIORITIES = [
  {id:"critical",label:"Critical",bg:"#fef2f2",c:"#dc2626"},
  {id:"high",label:"High",bg:"#fff7ed",c:"#ea580c"},
  {id:"medium",label:"Medium",bg:"#fefce8",c:"#ca8a04"},
  {id:"low",label:"Low",bg:"#f0fdf4",c:"#16a34a"}
];
const CPL_STATUSES = [
  {id:"open",label:"Open",bg:"#fee2e2",c:"#dc2626"},
  {id:"in_progress",label:"In Progress",bg:"#fef3c7",c:"#b45309"},
  {id:"resolved",label:"Resolved",bg:"#dcfce7",c:"#15803d"}
];

let cplFormState = {};
let cplRespTarget = null;
let cplPickerOpen = false;
let cplSalesPickerOpen = false;
let editingComplaintId = null;

document.getElementById("btn-add-complain").onclick=()=>openComplainForm();

function openComplainForm(){
  editingComplaintId=null;
  document.getElementById("cpl-form-modal-title").innerHTML='⚠ Log Complain';
  const now=new Date();
  cplFormState={
    company:"", contactPerson:"", detail:"", priority:"medium", assignedTo:"",
    dateIn:now.toISOString().split("T")[0],
    timeIn:now.toTimeString().slice(0,5),
    nextFollowUp:"",
    initialResponse:""
  };
  renderCplForm();
  document.getElementById("cpl-form-modal").style.display="flex";
}

function renderCplForm(){
  const s=cplFormState;
  document.getElementById("cpl-form-body").innerHTML=`
    <div>
      <label class="field-lbl">Client Company *</label>
      <div class="picker-wrap" id="cpl-picker-wrap">
        <div class="picker-trigger" onclick="toggleCplPicker()">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${s.company?"#0f172a":"#94a3b8"}">${s.company||"Select a company..."}</span>
          <span style="font-size:10px;color:#94a3b8;margin-left:8px">▼</span>
        </div>
        <div class="picker-dropdown" id="cpl-picker-dropdown" style="display:none">
          <div class="picker-search"><input type="text" id="cpl-picker-q" placeholder="Search company..." oninput="renderCplPickerList()"></div>
          <div class="picker-list" id="cpl-picker-list"></div>
        </div>
      </div>
    </div>
    <div class="field-grid">
      <div><label class="field-lbl">Contact Person *</label><input class="field-inp" value="${e(s.contactPerson)}" oninput="cplFormState.contactPerson=this.value" placeholder="Contact name"></div>
      <div>
        <label class="field-lbl">Handled By (Sales) *</label>
        <div class="picker-wrap" id="cpl-sales-picker-wrap">
          <div class="picker-trigger" onclick="toggleCplSalesPicker()" style="min-height:34px">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${s.assignedTo?"#0f172a":"#94a3b8"}">${s.assignedTo||"Select sales..."}</span>
            <span style="font-size:10px;color:#94a3b8;margin-left:8px">▼</span>
          </div>
          <div class="picker-dropdown" id="cpl-sales-picker-dropdown" style="display:none">
            <div class="picker-search"><input type="text" id="cpl-sales-picker-q" placeholder="Search sales..." oninput="renderCplSalesPickerList()"></div>
            <div class="picker-list" id="cpl-sales-picker-list"></div>
          </div>
        </div>
      </div>
    </div>
    <div>
      <label class="field-lbl">Priority</label>
      <div class="ch-grid">${PRIORITIES.map(p=>`<button class="ch-btn${s.priority===p.id?" sel":""}" onclick="cplFormState.priority='${p.id}';renderCplForm()" style="${s.priority===p.id?`border-color:${p.c};background:${p.bg};color:${p.c}`:""}">${p.label}</button>`).join("")}</div>
    </div>
    <div>
      <label class="field-lbl">Complaint Detail *</label>
      <textarea class="resp-textarea" style="min-height:100px" placeholder="Describe the client complaint in detail..." oninput="cplFormState.detail=this.value">${e(s.detail)}</textarea>
    </div>
    <div class="field-grid">
      <div><label class="field-lbl">Date Received</label><input type="date" class="field-inp" value="${s.dateIn}" onchange="cplFormState.dateIn=this.value"></div>
      <div><label class="field-lbl">Time Received</label><input type="time" class="field-inp" value="${s.timeIn}" onchange="cplFormState.timeIn=this.value"></div>
    </div>
    <div>
      <label class="field-lbl">Next Follow-Up Schedule</label>
      <input type="date" class="field-inp" value="${s.nextFollowUp}" onchange="cplFormState.nextFollowUp=this.value">
    </div>
    <div>
      <label class="field-lbl">Initial Internal Response</label>
      <textarea class="resp-textarea" placeholder="Initial action taken..." oninput="cplFormState.initialResponse=this.value">${e(s.initialResponse)}</textarea>
    </div>
    <button class="btn-save" style="background:#dc2626" onclick="saveComplaint()">Save Complaint</button>`;
  renderCplPickerList();
  renderCplSalesPickerList();
  setTimeout(()=>{
    document.addEventListener("mousedown",closeCplPicker);
    document.addEventListener("mousedown",closeCplSalesPicker);
  },0);
}

// Complaint company picker
function toggleCplPicker(){
  cplPickerOpen=!cplPickerOpen;
  const dd=document.getElementById("cpl-picker-dropdown"); if(!dd)return;
  dd.style.display=cplPickerOpen?"block":"none";
  if(cplPickerOpen)setTimeout(()=>{const qi=document.getElementById("cpl-picker-q");if(qi)qi.focus();},50);
}
function closeCplPicker(ev){
  const wrap=document.getElementById("cpl-picker-wrap");
  if(wrap&&!wrap.contains(ev.target)){cplPickerOpen=false;const dd=document.getElementById("cpl-picker-dropdown");if(dd)dd.style.display="none";}
}
function renderCplPickerList(){
  const q=(document.getElementById("cpl-picker-q")||{}).value||"";
  const filtered=companies.filter(c=>c.toLowerCase().includes(q.toLowerCase()));
  const showAdd=q.trim()&&!companies.some(c=>c.toLowerCase()===q.trim().toLowerCase());
  const list=document.getElementById("cpl-picker-list"); if(!list)return;
  list.innerHTML=`${filtered.length===0&&!showAdd?`<p style="font-size:12px;color:#94a3b8;padding:10px 12px">Not found</p>`:""}
    ${filtered.map(c=>`<div class="picker-item${c===cplFormState.company?" sel":""}" onclick="selectCplCompany('${e(c)}')">${avatarHTML(c,24)}${e(c)}${c===cplFormState.company?`<span style="margin-left:auto;font-size:11px;color:#1d4ed8">✓</span>`:""}</div>`).join("")}
    ${showAdd?`<div class="picker-add" onclick="addCplCompany('${e(q.trim())}')"><div class="picker-add-icon">+</div>Add "${e(q.trim())}"</div>`:""}`;
}
function selectCplCompany(name){
  cplFormState.company=name; cplPickerOpen=false;
  const dd=document.getElementById("cpl-picker-dropdown"); if(dd)dd.style.display="none";
  const trig=document.querySelector("#cpl-picker-wrap .picker-trigger span");
  if(trig){trig.textContent=name;trig.style.color="#0f172a";}
  renderCplPickerList();
}
async function addCplCompany(name){
  if(!companies.includes(name)){
    try { await api('POST','/companies',{name}); } catch(e){}
    companies=[...companies,name].sort();
  }
  selectCplCompany(name); render();
}

// Complaint sales picker
function toggleCplSalesPicker(){
  cplSalesPickerOpen=!cplSalesPickerOpen;
  const dd=document.getElementById("cpl-sales-picker-dropdown"); if(!dd)return;
  dd.style.display=cplSalesPickerOpen?"block":"none";
  if(cplSalesPickerOpen)setTimeout(()=>{const qi=document.getElementById("cpl-sales-picker-q");if(qi)qi.focus();},50);
}
function closeCplSalesPicker(ev){
  const wrap=document.getElementById("cpl-sales-picker-wrap");
  if(wrap&&!wrap.contains(ev.target)){cplSalesPickerOpen=false;const dd=document.getElementById("cpl-sales-picker-dropdown");if(dd)dd.style.display="none";}
}
function renderCplSalesPickerList(){
  const q=(document.getElementById("cpl-sales-picker-q")||{}).value||"";
  const filtered=salespeople.filter(s=>s.toLowerCase().includes(q.toLowerCase()));
  const showAdd=q.trim()&&!salespeople.some(s=>s.toLowerCase()===q.trim().toLowerCase());
  const list=document.getElementById("cpl-sales-picker-list"); if(!list)return;
  list.innerHTML=`${filtered.length===0&&!showAdd?`<p style="font-size:12px;color:#94a3b8;padding:10px 12px">Not found</p>`:""}
    ${filtered.map(s=>`<div class="picker-item${s===cplFormState.assignedTo?" sel":""}" onclick="selectCplSales('${e(s)}')"><div class="avatar" style="${avatarStyle(s,24)}">${initials(s)}</div>${e(s)}${s===cplFormState.assignedTo?`<span style="margin-left:auto;font-size:11px;color:#16a34a">✓</span>`:""}</div>`).join("")}
    ${showAdd?`<div class="picker-add" onclick="addCplSales('${e(q.trim())}')"><div class="picker-add-icon" style="background:#d1fae5;color:#16a34a">+</div>Add "${e(q.trim())}"</div>`:""}`;
}
function selectCplSales(name){
  cplFormState.assignedTo=name; cplSalesPickerOpen=false;
  const dd=document.getElementById("cpl-sales-picker-dropdown"); if(dd)dd.style.display="none";
  const trig=document.querySelector("#cpl-sales-picker-wrap .picker-trigger span");
  if(trig){trig.textContent=name;trig.style.color="#0f172a";}
  renderCplSalesPickerList();
}
async function addCplSales(name){
  if(!salespeople.includes(name)){
    try { await api('POST','/salespeople',{name}); } catch(e){}
    salespeople=[...salespeople,name].sort();
  }
  selectCplSales(name);
}

async function saveComplaint(){
  const s=cplFormState;
  if(!s.company||!s.contactPerson||!s.detail||!s.assignedTo){alert("Company, Contact Person, Detail, and Handled By are required.");return;}
  try {
    if(editingComplaintId){
      const updated=await api('PUT','/complaints/'+editingComplaintId,{
        company:s.company,contactPerson:s.contactPerson,detail:s.detail,
        priority:s.priority||"medium",assignedTo:s.assignedTo,
        dateIn:s.dateIn,timeIn:s.timeIn,nextFollowUp:s.nextFollowUp
      });
      complaints=complaints.map(c=>c.id===editingComplaintId?updated:c);
      editingComplaintId=null;
    } else {
      const created=await api('POST','/complaints',{
        id:Date.now().toString(),company:s.company,contactPerson:s.contactPerson,detail:s.detail,
        priority:s.priority||"medium",assignedTo:s.assignedTo,
        dateIn:s.dateIn,timeIn:s.timeIn,nextFollowUp:s.nextFollowUp,
        initialResponse:s.initialResponse||""
      });
      complaints=[created,...complaints];
    }
    closeModal("cpl-form-modal");
    setTab("complaints");
    render();
  } catch(err){ alert("Gagal menyimpan complaint: "+err.message); }
}

function editComplaint(id){
  const c=complaints.find(x=>x.id===id); if(!c) return;
  editingComplaintId=id;
  document.getElementById("cpl-form-modal-title").innerHTML='✏ Edit Complain';
  cplFormState={
    company:c.company, contactPerson:c.contactPerson, detail:c.detail,
    priority:c.priority, assignedTo:c.assignedTo,
    dateIn:c.dateIn, timeIn:c.timeIn, nextFollowUp:c.nextFollowUp,
    initialResponse:""
  };
  renderCplForm();
  document.getElementById("cpl-form-modal").style.display="flex";
}

async function deleteComplaint(id){
  if(!confirm("Delete this complaint? All internal responses will also be removed.")) return;
  try {
    await api('DELETE','/complaints/'+id);
    complaints=complaints.filter(c=>c.id!==id);
    expandedComplaints.delete(id);
    render();
  } catch(err){ alert("Gagal menghapus complaint: "+err.message); }
}

// ── RENDER COMPLAINTS TAB ───────────────────────────────────────────────────
function renderComplaintsTab(content){
  const q=(document.getElementById("search-input")||{}).value||"";
  let filtered=complaints;
  if(q){
    const ql=q.toLowerCase();
    filtered=complaints.filter(c=>c.company.toLowerCase().includes(ql)||c.contactPerson.toLowerCase().includes(ql));
  }
  const statusOrder={open:0,in_progress:1,resolved:2};
  filtered=[...filtered].sort((a,b)=>{
    const so=statusOrder[a.status]-statusOrder[b.status];
    if(so!==0) return so;
    return (b.dateIn+b.timeIn).localeCompare(a.dateIn+a.timeIn);
  });

  if(!filtered.length){
    content.innerHTML=`<div class="empty"><div style="font-size:32px;margin-bottom:12px">📋</div>${complaints.length===0?"No complaints yet. Click '+ Log Complain' to start.":"No results found."}</div>`;
    return;
  }
  content.innerHTML=filtered.map(c=>renderComplaintCard(c)).join("");
}

function renderComplaintCard(c){
  const expanded=expandedComplaints.has(c.id);
  const prio=PRIORITIES.find(p=>p.id===c.priority)||PRIORITIES[2];
  const stat=CPL_STATUSES.find(s=>s.id===c.status)||CPL_STATUSES[0];
  const fuDays=daysUntil(c.nextFollowUp);
  const fuOverdue=fuDays!==null&&fuDays<0;
  const fuSoon=fuDays!==null&&fuDays<=1;
  const fuColor=fuOverdue?"#dc2626":fuSoon?"#b45309":"#15803d";
  const fuBg=fuOverdue?"#fee2e2":fuSoon?"#fef3c7":"#dcfce7";
  const fuText=fuDays===null?"":fuOverdue?`${Math.abs(fuDays)}d overdue`:fuDays===0?"Today":`${fuDays}d left`;
  const respCount=c.responses.length;
  const lastResp=c.responses.length?c.responses[c.responses.length-1]:null;

  const lastTime=lastResp?new Date(`${lastResp.date}T${lastResp.time||"00:00"}`):new Date(`${c.dateIn}T${c.timeIn||"00:00"}`);
  const hoursSince=Math.floor((new Date()-lastTime)/(1000*60*60));
  const needsUpdate=c.status!=="resolved"&&hoursSince>=24;

  let detail="";
  if(expanded){
    detail=`<div class="cpl-expanded">
      <div>
        <div class="cpl-section-lbl">Complaint Detail</div>
        <div class="cpl-detail-full">${e(c.detail)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div><div class="cpl-section-lbl">Contact</div><span style="font-size:12px;color:#334155">${e(c.contactPerson)}</span></div>
        <div><div class="cpl-section-lbl">Handled By</div><span class="tag">${e(c.assignedTo)}</span></div>
        <div><div class="cpl-section-lbl">Priority</div><span class="cpl-priority ${c.priority}">${prio.label}</span></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><div class="cpl-section-lbl">Tanggal/Time Received</div><span style="font-size:12px;color:#334155">${c.dateIn} ${c.timeIn||""}</span></div>
        <div><div class="cpl-section-lbl">Follow-Up Berikutnya</div>
          ${c.nextFollowUp?`<span style="font-size:12px;color:${fuColor};font-weight:500">${c.nextFollowUp} · ${fuText}</span>`:`<span style="font-size:12px;color:#94a3b8">—</span>`}
        </div>
      </div>
      <div>
        <div class="cpl-section-lbl">Internal Response Timeline (${respCount})</div>
        ${respCount?`<div class="cpl-timeline">${c.responses.slice().reverse().map((r,i)=>{
          const dotClass=c.status==="resolved"&&i===0?"resolve":i===0?"latest":"normal";
          return `<div class="cpl-tl-item">
            <div class="cpl-tl-dot ${dotClass}"></div>
            <div class="cpl-tl-head">
              <span class="cpl-tl-by">${e(r.by)}</span>
              <span class="cpl-tl-date">${r.date} ${r.time||""}</span>
            </div>
            <div class="cpl-tl-note">${e(r.note)}</div>
          </div>`;
        }).join("")}</div>`:`<div style="font-size:12px;color:#94a3b8;padding:8px 0">No internal response(s)ses yet.</div>`}
      </div>
      ${needsUpdate?`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:8px 12px;font-size:12px;color:#dc2626;font-weight:500">⚠ ${hoursSince} hours since last response — needs update!</div>`:""}
      <div class="cpl-actions">
        ${c.status!=="resolved"?`<button class="btn-cpl btn-cpl-response" onclick="openCplResponse('${c.id}')">💬 Add Response</button>`:""}
        ${c.status!=="resolved"?`<button class="btn-cpl btn-cpl-resolve" onclick="resolveComplaint('${c.id}')">✅ Resolve / Close</button>`:""}
        ${c.status==="resolved"?`<button class="btn-cpl btn-cpl-reopen" onclick="reopenComplaint('${c.id}')">🔄 Reopen</button>`:""}
        ${c.status==="open"?`<button class="btn-cpl" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe" onclick="setCplStatus('${c.id}','in_progress')">⏳ In Progress</button>`:""}
        <button class="btn-edit" onclick="editComplaint('${c.id}')">✏ Edit</button>
        <button class="btn-del" onclick="deleteComplaint('${c.id}')">🗑 Delete</button>
      </div>
    </div>`;
  }

  return `<div class="cpl-card ${c.priority==="critical"||c.priority==="high"?c.priority:""}" style="${needsUpdate&&!expanded?"border-color:#fca5a5":""}">
    <div class="cpl-header" onclick="toggleComplaint('${c.id}')">
      ${avatarHTML(c.company,36)}
      <div class="cpl-body">
        <div class="cpl-top">
          <span class="cpl-company">${e(c.company)}</span>
          <span class="cpl-status ${c.status}">${stat.label}</span>
        </div>
        <div class="cpl-detail">${e(c.detail)}</div>
        <div class="cpl-meta">
          <span class="cpl-priority ${c.priority}">${prio.label}</span>
          <span class="cpl-date">${c.dateIn} ${c.timeIn||""}</span>
          ${c.nextFollowUp&&c.status!=="resolved"?`<span class="cpl-fu" style="background:${fuBg};color:${fuColor}">📅 ${fuText}</span>`:""}
          ${respCount?`<span style="font-size:11px;color:#94a3b8">💬 ${respCount} response(s)</span>`:""}
          ${needsUpdate?`<span style="font-size:11px;color:#dc2626;font-weight:500">⚠ ${hoursSince}h</span>`:""}
        </div>
      </div>
      <span class="cpl-arrow">${expanded?"▲":"▼"}</span>
    </div>
    ${detail}
  </div>`;
}

function toggleComplaint(id){
  expandedComplaints.has(id)?expandedComplaints.delete(id):expandedComplaints.add(id); render();
}
async function setCplStatus(id,status){
  try {
    await api('PATCH','/complaints/'+id+'/status',{status});
    complaints=complaints.map(c=>c.id===id?{...c,status}:c); render();
  } catch(err){ alert("Gagal update status: "+err.message); }
}
async function resolveComplaint(id){
  const c=complaints.find(x=>x.id===id); if(!c) return;
  const now=new Date();
  try {
    await api('POST','/complaints/'+id+'/responses',{
      note:"✅ Complaint closed / resolved.",by:c.assignedTo,
      date:now.toISOString().split("T")[0],time:now.toTimeString().slice(0,5)
    });
    await api('PATCH','/complaints/'+id+'/status',{status:"resolved"});
    const fresh=await api('GET','/complaints');
    complaints=fresh; render();
  } catch(err){ alert("Gagal resolve: "+err.message); }
}
async function reopenComplaint(id){
  const c=complaints.find(x=>x.id===id); if(!c) return;
  const now=new Date();
  try {
    await api('POST','/complaints/'+id+'/responses',{
      note:"🔄 Complaint reopened.",by:c.assignedTo,
      date:now.toISOString().split("T")[0],time:now.toTimeString().slice(0,5)
    });
    await api('PATCH','/complaints/'+id+'/status',{status:"in_progress"});
    const fresh=await api('GET','/complaints');
    complaints=fresh; render();
  } catch(err){ alert("Gagal reopen: "+err.message); }
}

// ── RESPONSE MODAL ──────────────────────────────────────────────────────────
function openCplResponse(cplId){
  const c=complaints.find(x=>x.id===cplId); if(!c) return;
  cplRespTarget=cplId;
  const now=new Date();
  document.getElementById("cpl-resp-sub").textContent=`${c.company} · ${c.dateIn}`;
  document.getElementById("cpl-resp-body").innerHTML=`
    <div>
      <label class="field-lbl">Response / Action taken *</label>
      <textarea class="resp-textarea" id="cpl-resp-note" placeholder="Describe the internal response(s)se / action..."></textarea>
    </div>
    <div class="field-grid">
      <div><label class="field-lbl">Tanggal</label><input type="date" class="field-inp" id="cpl-resp-date" value="${now.toISOString().split("T")[0]}"></div>
      <div><label class="field-lbl">Waktu</label><input type="time" class="field-inp" id="cpl-resp-time" value="${now.toTimeString().slice(0,5)}"></div>
    </div>
    <div>
      <label class="field-lbl">By</label>
      <div class="picker-wrap" id="cpl-resp-sales-wrap">
        <div class="picker-trigger" onclick="toggleRespSalesPicker()" style="min-height:34px">
          <span id="cpl-resp-sales-label" style="flex:1;color:${c.assignedTo?"#0f172a":"#94a3b8"}">${c.assignedTo||"Select sales..."}</span>
          <span style="font-size:10px;color:#94a3b8;margin-left:8px">▼</span>
        </div>
        <div class="picker-dropdown" id="cpl-resp-sales-dd" style="display:none">
          <div class="picker-search"><input type="text" id="cpl-resp-sales-q" placeholder="Search..." oninput="renderRespSalesList()"></div>
          <div class="picker-list" id="cpl-resp-sales-list"></div>
        </div>
      </div>
    </div>
    <div>
      <label class="field-lbl">Update Follow-Up Schedule</label>
      <input type="date" class="field-inp" id="cpl-resp-fu" value="${c.nextFollowUp||""}">
    </div>
    <button class="btn-save" onclick="saveCplResponse()">Save Response</button>`;
  cplRespSalesSelected=c.assignedTo||"";
  renderRespSalesList();
  document.getElementById("cpl-resp-modal").style.display="flex";
}

let cplRespSalesSelected="";
let respSalesOpen=false;
function toggleRespSalesPicker(){
  respSalesOpen=!respSalesOpen;
  const dd=document.getElementById("cpl-resp-sales-dd"); if(!dd)return;
  dd.style.display=respSalesOpen?"block":"none";
}
function renderRespSalesList(){
  const q=(document.getElementById("cpl-resp-sales-q")||{}).value||"";
  const filtered=salespeople.filter(s=>s.toLowerCase().includes(q.toLowerCase()));
  const list=document.getElementById("cpl-resp-sales-list"); if(!list)return;
  list.innerHTML=filtered.map(s=>`<div class="picker-item${s===cplRespSalesSelected?" sel":""}" onclick="selectRespSales('${e(s)}')"><div class="avatar" style="${avatarStyle(s,24)}">${initials(s)}</div>${e(s)}</div>`).join("");
}
function selectRespSales(name){
  cplRespSalesSelected=name; respSalesOpen=false;
  const dd=document.getElementById("cpl-resp-sales-dd"); if(dd)dd.style.display="none";
  const lbl=document.getElementById("cpl-resp-sales-label"); if(lbl){lbl.textContent=name;lbl.style.color="#0f172a";}
}
async function saveCplResponse(){
  const note=(document.getElementById("cpl-resp-note")||{}).value||"";
  if(!note.trim()){alert("Response is required.");return;}
  const date=(document.getElementById("cpl-resp-date")||{}).value||"";
  const time=(document.getElementById("cpl-resp-time")||{}).value||"";
  const fu=(document.getElementById("cpl-resp-fu")||{}).value||"";
  const by=cplRespSalesSelected||"Unknown";
  if(!cplRespTarget)return;
  try {
    await api('POST','/complaints/'+cplRespTarget+'/responses',{note:note.trim(),by,date,time});
    if(fu){
      const c=complaints.find(x=>x.id===cplRespTarget);
      if(c) await api('PUT','/complaints/'+cplRespTarget,{...c,nextFollowUp:fu});
    }
    const fresh=await api('GET','/complaints');
    complaints=fresh;
    closeModal("cpl-resp-modal"); render();
  } catch(err){ alert("Gagal simpan respon: "+err.message); }
}

// ── EXPORT MODAL ─────────────────────────────────────────────────────────────
let expSelected=new Set();
let expMode="one"; // "one" or "separate"

document.getElementById("btn-export-excel").onclick=()=>openExportModal();

function openExportModal(){
  expSelected=new Set();
  expMode="one";
  setExpMode("one");
  renderExpList();
  document.getElementById("export-modal").style.display="flex";
}

function renderExpList(){
  // Get companies that have records or complaints
  const companySet=new Set();
  records.forEach(r=>companySet.add(r.company));
  complaints.forEach(c=>companySet.add(c.company));
  const list=[...companySet].sort();

  const el=document.getElementById("exp-company-list");
  if(!list.length){
    el.innerHTML='<div style="text-align:center;padding:32px;color:#94a3b8;font-size:13px">No data available to export.</div>';
    updateExpCount();
    return;
  }

  el.innerHTML=list.map(c=>{
    const rCount=records.filter(r=>r.company===c).length;
    const cCount=complaints.filter(x=>x.company===c).length;
    const sel=expSelected.has(c);
    const meta=[];
    if(rCount) meta.push(rCount+" comm");
    if(cCount) meta.push(cCount+" complaint");
    return `<div class="exp-company-item${sel?" selected":""}" onclick="toggleExpCompany('${e(c)}')">
      <div class="exp-cb">${sel?"✓":""}</div>
      ${avatarHTML(c,28)}
      <span class="exp-company-name">${e(c)}</span>
      <span class="exp-company-count">${meta.join(" · ")}</span>
    </div>`;
  }).join("");
  updateExpCount();
}

function toggleExpCompany(name){
  if(expSelected.has(name)) expSelected.delete(name);
  else expSelected.add(name);
  renderExpList();
}

function expSelectAll(){
  const companySet=new Set();
  records.forEach(r=>companySet.add(r.company));
  complaints.forEach(c=>companySet.add(c.company));
  expSelected=companySet;
  renderExpList();
}

function expDeselectAll(){
  expSelected=new Set();
  renderExpList();
}

function updateExpCount(){
  const n=expSelected.size;
  document.getElementById("exp-count").textContent=n+" selected";
  document.getElementById("btn-export-go").disabled=n===0;
  document.getElementById("btn-export-go").textContent=n>0?`📊 Export ${n} Companies`:"📊 Export";
}

function setExpMode(mode){
  expMode=mode;
  document.getElementById("exp-mode-one").className="exp-mode-btn"+(mode==="one"?" active":"");
  document.getElementById("exp-mode-sep").className="exp-mode-btn"+(mode==="separate"?" active":"");
}

function runExport(){
  if(!expSelected.size) return;
  const selected=[...expSelected].sort();

  if(expMode==="separate"){
    selected.forEach(c=>exportCompanyExcel(c));
  } else {
    exportMultiCompanyExcel(selected);
  }
  closeModal("export-modal");
}

function exportMultiCompanyExcel(companyList){
  const wb=XLSX.utils.book_new();

  // Master summary sheet
  const masterData=[
    ["CLIENT INTERACTION LOG — MULTI-COMPANY REPORT"],
    ["Generated",new Date().toLocaleString("id-ID")],
    ["Companies",companyList.length],
    [],
    ["No","Company","Communications","Open Complaints","Total Complaints","Last Activity"]
  ];
  companyList.forEach((company,i)=>{
    const compRec=records.filter(r=>r.company===company);
    const compCpl=complaints.filter(c=>c.company===company);
    const openCpl=compCpl.filter(c=>c.status!=="resolved").length;
    const lastDate=compRec.length?compRec.sort((a,b)=>b.date.localeCompare(a.date))[0].date:"—";
    masterData.push([i+1,company,compRec.length,openCpl,compCpl.length,lastDate]);
  });
  const wsM=XLSX.utils.aoa_to_sheet(masterData);
  wsM["!cols"]=[{wch:5},{wch:30},{wch:16},{wch:16},{wch:16},{wch:14}];
  XLSX.utils.book_append_sheet(wb,wsM,"Overview");

  // Per-company sheets
  companyList.forEach(company=>{
    const compRec=records.filter(r=>r.company===company).sort((a,b)=>b.date.localeCompare(a.date));
    const compCpl=complaints.filter(c=>c.company===company).sort((a,b)=>b.dateIn.localeCompare(a.dateIn));

    const data=[
      [company.toUpperCase()+" — REPORT"],
      ["Communications: "+compRec.length,"Complaints: "+compCpl.length],
      [],
      ["COMMUNICATIONS"],
      ["No","Date","Time","Channel","Contact","Logged By","Follow-Up","Deadline","Topics"]
    ];
    compRec.forEach((r,i)=>{
      const ch=CHANNELS.find(c=>c.id===r.channel)||CHANNELS[0];
      const topics=(r.discussions||[]).map(d=>{
        const pts=(d.points||[]).join("; ");
        return d.topic?(d.topic+(pts?": "+pts:"")):(pts||"");
      }).filter(Boolean).join(" | ");
      data.push([i+1,r.date,r.time||"",ch.label,r.contactPerson,r.salesRep||"",r.urgentFollowUp?"Yes":"No",r.followUpDeadline||"",topics]);
    });
    if(!compRec.length) data.push(["","No communications recorded"]);

    if(compCpl.length){
      data.push([]);
      data.push(["COMPLAINTS"]);
      data.push(["No","Date","Status","Priority","Contact","Handled By","Detail","Responses"]);
      compCpl.forEach((c,i)=>{
        const stat=CPL_STATUSES.find(s=>s.id===c.status)||CPL_STATUSES[0];
        const prio=PRIORITIES.find(p=>p.id===c.priority)||PRIORITIES[2];
        const resps=c.responses.map(r=>`[${r.date}] ${r.by}: ${r.note}`).join("\n");
        data.push([i+1,c.dateIn+" "+(c.timeIn||""),stat.label,prio.label,c.contactPerson,c.assignedTo,c.detail,resps]);
      });
    }

    // Sheet name max 31 chars
    const sheetName=company.length>28?company.slice(0,28)+"..":company;
    const ws=XLSX.utils.aoa_to_sheet(data);
    ws["!cols"]=[{wch:5},{wch:14},{wch:8},{wch:14},{wch:18},{wch:14},{wch:10},{wch:12},{wch:55}];
    XLSX.utils.book_append_sheet(wb,ws,sheetName);
  });

  const filename=sanitizeFilename("CIL Report - "+companyList.length+" Companies")+".xlsx";
  XLSX.writeFile(wb,filename);
}

// ── EXCEL EXPORT PER COMPANY ────────────────────────────────────────────────
function exportCompanyExcel(company){
  const companyRecords=records.filter(r=>r.company===company).sort((a,b)=>b.date.localeCompare(a.date));
  const companyComplaints=complaints.filter(c=>c.company===company).sort((a,b)=>b.dateIn.localeCompare(a.dateIn));
  if(!companyRecords.length&&!companyComplaints.length){alert("No data available for "+company);return;}

  const wb=XLSX.utils.book_new();

  // ── Sheet 1: Summary ──
  const summaryData=[
    ["CLIENT INTERACTION LOG — COMPANY SUMMARY"],
    ["Company",company],
    ["Generated",new Date().toLocaleString("id-ID")],
    ["Total Communications",companyRecords.length],
    ["Total Complaints",companyComplaints.length],
    ["Open Complaints",companyComplaints.filter(c=>c.status!=="resolved").length],
    [],
    ["COMMUNICATION OVERVIEW"],
    ["No","Date","Time","Channel","Contact Person","Logged By","Follow-Up","Deadline","Topics Discussed"]
  ];
  companyRecords.forEach((r,i)=>{
    const ch=CHANNELS.find(c=>c.id===r.channel)||CHANNELS[0];
    const topics=(r.discussions||[]).map(d=>{
      const pts=(d.points||[]).join("; ");
      return d.topic?(d.topic+(pts?": "+pts:"")):(pts||"");
    }).filter(Boolean).join(" | ");
    summaryData.push([
      i+1, r.date, r.time||"", ch.label, r.contactPerson, r.salesRep||"",
      r.urgentFollowUp?"Yes":"No", r.followUpDeadline||"", topics
    ]);
  });

  const ws1=XLSX.utils.aoa_to_sheet(summaryData);
  ws1["!cols"]=[{wch:5},{wch:12},{wch:8},{wch:16},{wch:20},{wch:14},{wch:10},{wch:12},{wch:60}];
  XLSX.utils.book_append_sheet(wb,ws1,"Summary");

  // ── Sheet 2: Detailed Communications ──
  const detailData=[
    ["DETAILED COMMUNICATION LOG — "+company],
    []
  ];
  companyRecords.forEach((r,i)=>{
    const ch=CHANNELS.find(c=>c.id===r.channel)||CHANNELS[0];
    detailData.push(["Communication #"+(i+1)]);
    detailData.push(["Date",r.date+(r.time?" "+r.time:"")]);
    detailData.push(["Channel",ch.label]);
    detailData.push(["Contact",r.contactPerson]);
    detailData.push(["Logged By",r.salesRep||"—"]);
    if(r.channel==="offline"&&r.location) detailData.push(["Location",r.location]);
    if((r.participants||[]).filter(Boolean).length){
      detailData.push(["Attendees",(r.participants||[]).filter(Boolean).join(", ")]);
    }
    detailData.push([]);
    detailData.push(["","Topic","Discussion Points"]);
    (r.discussions||[]).forEach((d,di)=>{
      const pts=(d.points||[]).filter(Boolean).join("\n");
      detailData.push([di+1,d.topic||"(No topic)",pts]);
    });
    if(r.urgentFollowUp){
      detailData.push([]);
      detailData.push(["FOLLOW-UP",r.followUpNote||"","Deadline: "+(r.followUpDeadline||"—")]);
    }
    detailData.push([]);
    detailData.push(["─────────────────────────────────────"]);
    detailData.push([]);
  });

  const ws2=XLSX.utils.aoa_to_sheet(detailData);
  ws2["!cols"]=[{wch:18},{wch:25},{wch:60}];
  XLSX.utils.book_append_sheet(wb,ws2,"Communications");

  // ── Sheet 3: Complaints (if any) ──
  if(companyComplaints.length){
    const cplData=[
      ["COMPLAINT LOG — "+company],
      [],
      ["No","Date","Time","Status","Priority","Contact","Handled By","Detail","Next Follow-Up","Responses"]
    ];
    companyComplaints.forEach((c,i)=>{
      const resps=c.responses.map(r=>`[${r.date} ${r.time||""}] ${r.by}: ${r.note}`).join("\n");
      const stat=CPL_STATUSES.find(s=>s.id===c.status)||CPL_STATUSES[0];
      const prio=PRIORITIES.find(p=>p.id===c.priority)||PRIORITIES[2];
      cplData.push([
        i+1, c.dateIn, c.timeIn||"", stat.label, prio.label,
        c.contactPerson, c.assignedTo, c.detail, c.nextFollowUp||"", resps
      ]);
    });

    const ws3=XLSX.utils.aoa_to_sheet(cplData);
    ws3["!cols"]=[{wch:5},{wch:12},{wch:8},{wch:14},{wch:10},{wch:18},{wch:14},{wch:50},{wch:12},{wch:60}];
    XLSX.utils.book_append_sheet(wb,ws3,"Complaints");
  }

  const filename=sanitizeFilename(company+" - Report")+".xlsx";
  XLSX.writeFile(wb,filename);
}

// ── STAT DETAIL MODAL ─────────────────────────────────────────────────────────
function openStatDetail(type){
  const modal=document.getElementById("stat-modal");
  const title=document.getElementById("stat-modal-title");
  const sub=document.getElementById("stat-modal-sub");
  const body=document.getElementById("stat-modal-body");

  if(type==="companies"){
    const grouped=getGrouped();
    const companyList=Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b));
    title.textContent="Active Companies";
    sub.textContent=companyList.length+" companies with logged communications";
    if(!companyList.length){
      body.innerHTML='<div style="padding:32px;text-align:center;color:#94a3b8">No companies yet.</div>';
    } else {
      body.innerHTML=`<div class="stat-list">${companyList.map(([company,meetings],i)=>{
        const latest=meetings[0];
        const ch=CHANNELS.find(c=>c.id===latest.channel)||CHANNELS[0];
        const cplCount=complaints.filter(c=>c.company===company&&c.status!=="resolved").length;
        return `<div class="stat-list-item">
          <span class="stat-list-num">${i+1}</span>
          ${avatarHTML(company,28)}
          <div class="stat-list-body">
            <div class="stat-list-name">${e(company)}</div>
            <div class="stat-list-meta">${meetings.length} comm · Last: ${latest.date} · ${e(latest.contactPerson)}${cplCount?` · <span style="color:#dc2626">${cplCount} open complaint(s)</span>`:""}</div>
          </div>
          <span class="ch-pill" style="background:${ch.bg};color:${ch.color};font-size:10px">${ch.icon}</span>
        </div>`;
      }).join("")}</div>`;
    }

  } else if(type==="comms"){
    const sorted=[...records].sort((a,b)=>b.date.localeCompare(a.date));
    title.textContent="All Communications";
    sub.textContent=sorted.length+" total communications logged";
    if(!sorted.length){
      body.innerHTML='<div style="padding:32px;text-align:center;color:#94a3b8">No communications yet.</div>';
    } else {
      body.innerHTML=`<div class="stat-list">${sorted.map((m,i)=>{
        const ch=CHANNELS.find(c=>c.id===m.channel)||CHANNELS[0];
        const topicCount=(m.discussions||[]).filter(d=>d.topic||d.points?.length).length;
        return `<div class="stat-list-item">
          <span class="stat-list-num">${i+1}</span>
          ${avatarHTML(m.company,28)}
          <div class="stat-list-body">
            <div class="stat-list-name">${e(m.company)}</div>
            <div class="stat-list-meta">${m.date}${m.time?" "+m.time:""} · ${e(m.contactPerson)} · ${topicCount} topic(s)${m.salesRep?" · by "+e(m.salesRep):""}</div>
          </div>
          <span class="ch-pill" style="background:${ch.bg};color:${ch.color};font-size:10px">${ch.icon} ${ch.label}</span>
        </div>`;
      }).join("")}</div>`;
    }

  } else if(type==="followups"){
    const grouped=getGrouped();
    const urgentItems=Object.values(grouped).map(ms=>ms[0]).filter(m=>m&&m.urgentFollowUp)
      .sort((a,b)=>(daysUntil(a.followUpDeadline)??9999)-(daysUntil(b.followUpDeadline)??9999));
    title.textContent="Pending Follow-Ups";
    sub.textContent=urgentItems.length+" follow-up(s) pending";
    if(!urgentItems.length){
      body.innerHTML='<div style="padding:32px;text-align:center;color:#94a3b8">✓ No pending follow-ups</div>';
    } else {
      body.innerHTML=`<div class="stat-list">${urgentItems.map((m,i)=>{
        const ch=CHANNELS.find(c=>c.id===m.channel)||CHANNELS[0];
        const days=daysUntil(m.followUpDeadline);
        const ov=days!==null&&days<0, soon=days!==null&&days<=3;
        const fc=ov?"#dc2626":soon?"#b45309":"#15803d";
        const flbl=days===null?"No deadline":ov?`${Math.abs(days)}d overdue`:days===0?"Today":`${days}d left`;
        return `<div class="stat-list-item">
          <span class="stat-list-num">${i+1}</span>
          ${avatarHTML(m.company,28)}
          <div class="stat-list-body">
            <div class="stat-list-name">${e(m.company)}</div>
            <div class="stat-list-meta">${e(m.followUpNote||"—")}</div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${fc}">${flbl}</span>
        </div>`;
      }).join("")}</div>`;
    }

  } else if(type==="complaints"){
    const openCpl=complaints.filter(c=>c.status!=="resolved").sort((a,b)=>b.dateIn.localeCompare(a.dateIn));
    title.textContent="Open Complaints";
    sub.textContent=openCpl.length+" complaint(s) unresolved";
    if(!openCpl.length){
      body.innerHTML='<div style="padding:32px;text-align:center;color:#94a3b8">✓ No open complaints</div>';
    } else {
      body.innerHTML=`<div class="stat-list">${openCpl.map((c,i)=>{
        const prio=PRIORITIES.find(p=>p.id===c.priority)||PRIORITIES[2];
        const stat=CPL_STATUSES.find(s=>s.id===c.status)||CPL_STATUSES[0];
        const fuDays=daysUntil(c.nextFollowUp);
        const fuText=fuDays===null?"":fuDays<0?`${Math.abs(fuDays)}d overdue`:fuDays===0?"Today":`${fuDays}d left`;
        return `<div class="stat-list-item">
          <span class="stat-list-num">${i+1}</span>
          ${avatarHTML(c.company,28)}
          <div class="stat-list-body">
            <div class="stat-list-name">${e(c.company)}</div>
            <div class="stat-list-meta" style="display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden">${e(c.detail)}</div>
            <div style="display:flex;gap:6px;margin-top:3px">
              <span class="cpl-priority ${c.priority}" style="font-size:9px">${prio.label}</span>
              <span style="font-size:10px;color:#94a3b8">${c.dateIn}</span>
              ${c.responses.length?`<span style="font-size:10px;color:#94a3b8">💬 ${c.responses.length}</span>`:""}
              ${fuText?`<span style="font-size:10px;font-weight:500;color:${fuDays<0?"#dc2626":"#b45309"}">${fuText}</span>`:""}
            </div>
          </div>
          <span class="cpl-status ${c.status}" style="font-size:10px">${stat.label}</span>
        </div>`;
      }).join("")}</div>`;
    }
  }

  modal.style.display="flex";
}


loadAll();