const NAV=[["DRIVER",[["dashboard","⌂","Dashboard"],["trips","◷","My Trips"],["passenger-list","♙","Passenger List"],["vehicle","▣","My Vehicle"],["maintenance","⚙","Maintenance"],["reviews","★","My Reviews"],["announcements","✉","Announcements"]]],
 ["ACCOUNT",[["password","⚿","Change Password"],["logout","↪","Logout"]]]];
const P={};let DT="";
const myTrips=()=>db.trips.filter(t=>t.drv===me.id&&t.status!=="Cancelled").sort((a,b)=>a.dep.localeCompare(b.dep));
const myVehs=()=>[...new Set(myTrips().map(t=>t.veh))].map(veh);
const myRatings=()=>db.reviews.filter(r=>trip(r.trip).drv===me.id);
const rate=()=>{const r=myRatings();return r.length?avg(r.map(x=>x.rating)).toFixed(1):"—"};

P.dashboard=()=>{
 const T=myTrips(),done=T.filter(t=>t.status==="Completed");
 const pax=db.bookings.filter(b=>b.status==="CONFIRMED"&&done.some(t=>t.id===b.trip)).length;
 return head(`Welcome back, ${esc(me.name.split(" ")[0])}`,"Manage your trips, passengers and vehicle.",`<button class="btn primary" onclick="go('trips')">View My Trips</button>`)+
 `<div class="stats">${stat("Upcoming trips",T.filter(t=>t.status==="Scheduled").length,"Scheduled for you","◷")}${stat("Completed",done.length,"Trips finished","✓")}${stat("Passengers served",pax,"On completed trips","♙")}${stat("Rating",rate(),"Passenger average","★")}</div>`+
 `<h3 class="sub">Latest announcements</h3>`+annList(db.ann.slice(0,2));
};

P.trips=()=>{
 const T=myTrips(),H=["Trip","Route","Vehicle","Departure","Arrival","Seats","Status"];
 const row=t=>[t.id,rname(t.route),veh(t.veh).no,fmt(t.dep),fmt(t.arr),`${filled(t)}/${veh(t.veh).cap}`,badge(t.status)];
 const act=t=>t.status==="Scheduled"?`<button class="btn small primary" onclick="A.setTrip('${t.id}','In Progress')">Start Trip</button>`:`<button class="btn small success" onclick="A.setTrip('${t.id}','Completed')">End Trip</button>`;
 return head("My Trips","Only trips assigned to you.")+
 card("Upcoming",tbl([...H,"Action"],T.filter(t=>t.status!=="Completed").map(t=>[...row(t),act(t)])))+
 card("Completed",tbl(H,T.filter(t=>t.status==="Completed").map(row)));
};

P["passenger-list"]=()=>{
 const T=myTrips();
 if(!T.some(t=>t.id===DT))DT=(T.find(t=>t.status!=="Completed")||T[0]||{}).id||"";
 const rows=db.bookings.filter(b=>b.trip===DT&&b.status==="CONFIRMED").sort((a,b)=>a.seat-b.seat);
 return head("Passengers on my trip","Boarding status and cash collection.")+
 `<div class="card"><div class="card-body"><select class="filter" onchange="DT=this.value;render()">${opts(T.map(t=>[t.id,`${tripName(t)} · ${fmt(t.dep)}`]),DT)}</select></div>`+
 tbl(["Seat","Name","Ticket status","Payment status","Boarded","Action"],rows.map(b=>{const p=db.payments.find(x=>x.bk===b.id)||{};
 return [b.seat,esc(user(b.pax).name),badge(b.status),badge(p.status||"—"),`<input type="checkbox" ${b.boarded?"checked":""} onchange="A.board('${b.id}',this.checked)">`,
 p.method==="CASH"&&p.status==="PENDING"?`<button class="btn small success" onclick="A.collect('${p.id}')">Collect cash</button>`:"—"]}))+`</div>`;
};

P.vehicle=()=>head("My Vehicle","Vehicle(s) on your trips, with documents.")+
 (myVehs().map(v=>`<div class="card"><div class="card-head"><h3>${esc(v.no)}</h3>${badge(v.status)}</div><div class="card-body">
 <div class="stats">${stat("Vehicle number",esc(v.no),"Assigned","▣")}${stat("Type",v.type,"Capacity: "+v.cap,"≡")}${stat("Insurance expiry",expiry(v.ins),"","⛨")}${stat("Licence expiry",expiry(v.lic),"","✓")}</div>
 <h3 class="sub">Photos &amp; documents (MongoDB)</h3>${v.files.length?v.files.map(f=>`<span class="badge blue">${esc(f)}</span>`).join(" "):"<small>No files uploaded yet.</small>"}
 <div class="form-actions" style="justify-content:flex-start"><button class="btn" onclick="A.upload('${v.id}')">Upload photo / document</button></div></div></div>`).join("")||'<div class="empty">No vehicle assigned yet.</div>');

P.maintenance=()=>{
 const vs=myVehs();
 return head("Maintenance","Report a problem and view past maintenance.")+
 card("Report a problem",`<div class="card-body narrow"><div class="field"><label>Vehicle</label><select id="mt_veh" class="form-control">${opts(vs.map(v=>[v.id,v.no]))}</select></div><div class="field"><label>Problem type</label><select id="mt_type" class="form-control">${opts(["Mechanical","Electrical","Tyre","Body","Other"].map(x=>[x,x]))}</select></div><div class="field"><label>Description</label><textarea id="mt_desc" class="form-control" rows="4" placeholder="Describe the issue..."></textarea></div><div class="err" id="mt_err"></div><button class="btn primary" onclick="A.report()">Submit report</button></div>`)+
 card("Maintenance history",tbl(["Date","Vehicle","Type","Issue","Status"],db.maint.filter(m=>vs.some(v=>v.id===m.veh)).sort((a,b)=>b.date.localeCompare(a.date)).map(m=>[m.date,veh(m.veh).no,m.type,esc(m.desc),badge(m.status)])));
};

P.reviews=()=>{
 const r=myRatings();
 return head("My Reviews","Your passenger ratings and comments.")+
 `<div class="stats">${stat("Average rating",rate(),"Based on completed trips","★")}${stat("Total reviews",r.length,"Passenger feedback","✎")}</div>`+
 card("Passenger comments (MongoDB)",`<div class="card-body">${r.map(x=>`<div class="notice"><b>${rname(trip(x.trip).route)}</b><div>${stars(x.rating)}</div><p>${esc(x.comment)}</p><small>${x.date}</small></div>`).join("")||'<div class="empty">No reviews yet.</div>'}</div>`);
};

Object.assign(A,{
 setTrip(id,s){
  if(s==="In Progress"&&myTrips().some(t=>t.status==="In Progress"))return toast("Finish your current trip first.");
  act(async()=>{await api("POST","/api/trips/"+id+"/status",{status:s});toast(`Trip is now ${s}`)})},
 board(id,v){api("POST","/api/tickets/"+id+"/board",{boarded:v}).then(()=>{by(db.bookings,id).boarded=v}).catch(e=>{toast(e.message);render()})},
 collect(id){act(async()=>{await api("POST","/api/payments/"+id+"/status",{status:"PAID"});toast("Cash collected, marked PAID")})},
 upload(id){modal("Upload photo / document",[{k:"files",l:"Files (stored in MongoDB)",t:"file",full:1}],async v=>{
  if(!v.files.length)return"Choose at least one file.";
  const fd=new FormData();v.files.forEach(x=>fd.append("files",x));
  await api("POST","/api/vehicles/"+id+"/files",fd);toast("Uploaded")})},
 async report(){
  const v=$("#mt_veh").value,d=$("#mt_desc").value.trim();
  if(!v)return $("#mt_err").textContent="No vehicle available.";
  if(!d)return $("#mt_err").textContent="Describe the problem first.";
  try{await api("POST","/api/maintenance",{veh:v,type:$("#mt_type").value,desc:d});
   toast("Maintenance report submitted");await reload();render()}catch(x){$("#mt_err").textContent=x.message}}
});

boot("Driver",NAV,P);