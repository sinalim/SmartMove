const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const lkr=n=>"LKR "+Number(n).toLocaleString("en-LK");
let TODAY="",NOW="";   // set by the server on every load
let db={users:[],vehicles:[],routes:[],trips:[],bookings:[],payments:[],reviews:[],ann:[],maint:[]};
const save=()=>{};      // data now lives in Oracle / MongoDB

/* ---- talk to server.js ---- */
async function api(method,url,body){
 const h={},t=sessionStorage.getItem("sm_token");if(t)h.Authorization="Bearer "+t;
 let b;if(body instanceof FormData)b=body;else if(body){h["Content-Type"]="application/json";b=JSON.stringify(body)}
 const r=await fetch(url,{method,headers:h,body:b});
 const j=await r.json().catch(()=>({}));
 if(r.status===401&&!url.includes("/api/login")){sessionStorage.clear();location.href="index.html";throw new Error("Please log in again.")}
 if(!r.ok)throw new Error(j.error||"Request failed");
 return j;
}
async function reload(){
 const d=await api("GET","/api/bootstrap");
 db=d.db;TODAY=d.today;NOW=d.now;
 if(me&&me.id){const u=by(db.users,me.id);if(u.id){me=u;if($("#avatar"))setAvatar()}}
}
const act=async fn=>{try{await fn()}catch(e){toast(e.message)}try{await reload()}catch(e){}render()};

/* lookups */
const by=(a,id)=>a.find(x=>x.id===id)||{};
const route=id=>by(db.routes,id),veh=id=>by(db.vehicles,id),user=id=>by(db.users,id),trip=id=>by(db.trips,id);
const rname=id=>{const r=route(id);return r.from?`${r.from} → ${r.to}`:"—"};
const tripName=t=>`${t.id} · ${rname(t.route)}`;
const fmt=d=>d?d.replace("T"," "):"—";
const filled=t=>db.bookings.filter(b=>b.trip===t.id&&b.status==="CONFIRMED").length;
const fare=b=>route(trip(b.trip).route).fare||0;
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const drivers=()=>db.users.filter(u=>u.role==="Driver"&&u.status==="Active");

/* ui helpers */
function badge(s){let c="blue";
 if(["PAID","CONFIRMED","Completed","Active","Scheduled","OK"].includes(s))c="green";
 if(["PENDING","In Progress","Maintenance","Due soon","Reported"].includes(s))c="orange";
 if(["CANCELLED","REFUNDED","Inactive","Cancelled","Expired"].includes(s))c="red";
 return `<span class="badge ${c}">${esc(s)}</span>`}
const stars=n=>`<span class="rating">${"★".repeat(Math.round(n))}${"☆".repeat(5-Math.round(n))}</span>`;
function expiry(d){const diff=(new Date(d)-new Date(TODAY))/864e5;return `${d} ${badge(diff<0?"Expired":diff<=30?"Due soon":"OK")}`}
function toast(m){const x=document.createElement("div");x.className="toast";x.textContent=m;$("#toasts").appendChild(x);setTimeout(()=>x.remove(),2600)}
const head=(t,d,a="")=>`<div class="page-head"><div><h2>${t}</h2><p>${d}</p></div><div class="actions">${a}</div></div>`;
const tbl=(h,rows)=>`<div class="table-wrap"><table><thead><tr>${h.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${h.length}" class="empty">No records found.</td></tr>`}</tbody></table></div>`;
const card=(t,body,right="")=>`<div class="card"><div class="card-head"><h3>${t}</h3><span>${right}</span></div>${body}</div>`;
const stat=(l,v,s,i="•")=>`<div class="stat"><div class="stat-top"><span>${l}</span><div class="stat-icon">${i}</div></div><strong>${v}</strong><small>${s}</small></div>`;
const opts=(list,sel)=>list.map(([v,l])=>`<option value="${esc(v)}" ${v==sel?"selected":""}>${esc(l)}</option>`).join("");
const annHtml=a=>`<div class="notice"><b>${esc(a.title)}</b><p>${esc(a.body)}</p><small>${a.date}</small></div>`;
const annList=l=>l.map(annHtml).join("")||'<div class="empty">No announcements.</div>';

function modal(title,fields,onSave){
 const el=document.createElement("div");el.className="modal-backdrop";
 el.innerHTML=`<div class="modal"><h3>${title}</h3><div class="form-grid">${fields.map(f=>{
  const id="f_"+f.k;let inp;
  if(f.t==="select")inp=`<select class="form-control" id="${id}">${opts(f.o,f.v)}</select>`;
  else if(f.t==="textarea")inp=`<textarea class="form-control" id="${id}" rows="4">${esc(f.v)}</textarea>`;
  else if(f.t==="file")inp=`<input class="form-control" id="${id}" type="file" multiple>`;
  else inp=`<input class="form-control" id="${id}" type="${f.t||"text"}" value="${esc(f.v)}" autocomplete="off">`;
  return `<div class="field ${f.full?"full":""}"><label>${f.l}</label>${inp}</div>`}).join("")}</div>
  <div class="err" id="m_err"></div>
  <div class="form-actions"><button class="btn" id="m_x">Cancel</button><button class="btn primary" id="m_ok">Save</button></div></div>`;
 document.body.appendChild(el);
 el.querySelector("#m_x").onclick=()=>el.remove();
 el.querySelector("#m_ok").onclick=async()=>{
  const v={};fields.forEach(f=>{const i=el.querySelector("#f_"+f.k);v[f.k]=f.t==="file"?[...i.files]:i.value.trim()});
  const btn=el.querySelector("#m_ok");btn.disabled=true;
  let e;try{e=await onSave(v)}catch(x){e=x.message}
  btn.disabled=false;
  if(e){el.querySelector("#m_err").textContent=e;return}
  el.remove();try{await reload()}catch(x){}render()};
}
const confirmDo=(msg,fn)=>{if(confirm(msg))return act(fn)};

/* shared actions */
const A={
 async changePw(){const a=$("#pw0").value,b=$("#pw1").value,c=$("#pw2").value,e=$("#pwerr");
  if(b.length<6)return e.textContent="New password needs 6+ characters.";
  if(b!==c)return e.textContent="Passwords don't match.";
  try{await api("POST","/api/password",{old:a,new:b});toast("Password updated");render()}catch(x){e.textContent=x.message}},
 profile(){
  modal("My Profile",[{k:"name",l:"Full name",v:me.name,full:1},{k:"email",l:"Email",t:"email",v:me.email,full:1}],async v=>{
   if(!v.name||!/^\S+@\S+\.\S+$/.test(v.email))return"Enter your name and a valid email.";
   await api("PUT","/api/profile",{name:v.name,email:v.email});toast("Profile updated")})}
};

/* shared pages (passenger + driver; admin overrides announcements) */
const sharedPassword=()=>head("Change Password","Update your account password.")+
 `<div class="card"><div class="card-body narrow"><div class="field"><label>Current password</label><input id="pw0" class="form-control" type="password" autocomplete="new-password"></div><div class="field"><label>New password</label><input id="pw1" class="form-control" type="password" autocomplete="new-password"></div><div class="field"><label>Confirm password</label><input id="pw2" class="form-control" type="password" autocomplete="new-password"></div><div class="err" id="pwerr"></div><button class="btn primary" onclick="A.changePw()">Update password</button></div></div>`;
const sharedAnn=()=>head("Announcements","Notices from SmartMove administrators (MongoDB).")+annList(db.ann);

/* shell */
let me={},page="dashboard",NAVC=[],PG={},XT={};
function render(){
 save();
 $("#nav").innerHTML=NAVC.map(([t,items])=>`<div class="sec">${t}</div>`+items.map(([p,i,l])=>`<button class="nav ${page===p?"active":""}" onclick="go('${p}')"><span>${i}</span>${l}</button>`).join("")).join("");
 const n=NAVC.flatMap(x=>x[1]).find(x=>x[0]===page);
 $("#page-title").textContent=n?n[2]:(XT[page]||"");
 $("#content").innerHTML=PG[page]();
 $("#search").value="";
}
function go(p){
 if(p==="logout"){sessionStorage.removeItem("sm_session");sessionStorage.removeItem("sm_token");location.href="index.html";return}
 page=p;render();window.scrollTo(0,0);
}
function setAvatar(){$("#avatar").textContent=me.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
async function boot(role,nav,pages,extraTitles={}){
 let s=null;try{s=JSON.parse(sessionStorage.getItem("sm_session"))}catch(e){}
 if(!s||s.role!==role||!sessionStorage.getItem("sm_token")){location.href="index.html";return}
 try{await reload()}catch(e){return}
 const u=user(s.id);
 if(!u.id||u.role!==role||u.status!=="Active"){location.href="index.html";return}
 me=u;NAVC=nav;XT=extraTitles;PG=Object.assign({password:sharedPassword,announcements:sharedAnn},pages);
 $("#role-label").textContent=role.toUpperCase();
 setAvatar();profileMenu();
 $("#search").addEventListener("input",e=>{const q=e.target.value.toLowerCase();document.querySelectorAll("#content tbody tr").forEach(r=>r.classList.toggle("hidden",!r.textContent.toLowerCase().includes(q)))});
 render();
}
function profileMenu(){
 const av=$("#avatar"),m=document.createElement("div");
 m.className="user-menu hidden";av.parentElement.appendChild(m);
 av.setAttribute("role","button");av.tabIndex=0;av.title="Account";
 const draw=()=>{m.innerHTML=`<div class="um-head"><b>${esc(me.name)}</b><small>${esc(me.email)}</small><span class="badge blue">${esc(me.role)}</span></div>
  <button onclick="A.profile()"><span>♙</span> My Profile</button>
  <button onclick="go('password')"><span>⚿</span> Change Password</button>
  <button class="danger" onclick="go('logout')"><span>↪</span> Logout</button>`};
 const toggle=e=>{e.stopPropagation();draw();m.classList.toggle("hidden")};
 av.addEventListener("click",toggle);
 av.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle(e)}});
 m.addEventListener("click",()=>m.classList.add("hidden"));
 document.addEventListener("click",e=>{if(!m.contains(e.target))m.classList.add("hidden")});
 document.addEventListener("keydown",e=>{if(e.key==="Escape")m.classList.add("hidden")});
}