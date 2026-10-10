const NAV=[["OPERATIONS",[["dashboard","⌂","Dashboard"],["users","♙","Users"],["vehicles","▣","Vehicles"],["routes","↔","Routes"],["trips","◷","Trips"]]],
 ["CUSTOMERS",[["bookings","▤","Bookings"],["payments","＄","Payments"],["reviews","★","Reviews"],["announcements","✉","Announcements"]]],
 ["REPORTS & ACCOUNT",[["reports","▥","Reports"],["password","⚿","Change Password"],["logout","↪","Logout"]]]];
const P={};
const F={bkTrip:"",bkDate:"",payM:"",payS:"",from:"",to:""};

P.dashboard=()=>{
 const todays=db.trips.filter(t=>t.dep.startsWith(TODAY)&&t.status!=="Cancelled").length;
 const sold=db.bookings.filter(b=>b.status==="CONFIRMED").length;
 const rev=db.payments.filter(p=>p.status==="PAID").reduce((s,p)=>s+fare(by(db.bookings,p.bk)),0);
 const days=[...Array(7)].map((_,i)=>{const d=new Date(TODAY);d.setDate(d.getDate()-6+i);return d.toISOString().slice(0,10)});
 const vals=days.map(d=>db.payments.filter(p=>p.status==="PAID"&&p.date===d).reduce((s,p)=>s+fare(by(db.bookings,p.bk)),0));
 const max=Math.max(...vals,1);
 return head("Dashboard","Overview of SmartMove operations.")+
 `<div class="stats">${stat("Total trips today",todays,"Excluding cancelled","◷")}${stat("Tickets sold",sold,"Confirmed tickets","▤")}${stat("Revenue",lkr(rev),"Paid tickets","＄")}${stat("Active vehicles",db.vehicles.filter(v=>v.status==="Active").length,`${db.vehicles.filter(v=>v.status==="Maintenance").length} in maintenance`,"▣")}</div>
 <div class="grid-2">${card("Revenue per day",`<div class="card-body"><div class="chart">${vals.map((v,i)=>`<div class="bar-wrap"><span class="bar-val">${v?(v/1000).toFixed(1)+"k":""}</span><div class="bar" style="height:${v/max*80}%"></div><span class="bar-label">${days[i].slice(5)}</span></div>`).join("")}</div></div>`,"Last 7 days")}
 ${card("Recent bookings",`<div class="card-body">${db.bookings.slice(-4).reverse().map(b=>`<div class="notice"><b>${b.id}</b> · ${esc(user(b.pax).name)}<p>${rname(trip(b.trip).route)} · Seat ${b.seat}</p>${badge(b.status)}</div>`).join("")}</div>`)}</div>`+
 card("Today's trips",tbl(["Trip","Route","Vehicle","Driver","Departure","Seats","Status"],db.trips.filter(t=>t.dep.startsWith(TODAY)).map(t=>[t.id,rname(t.route),veh(t.veh).no,esc(user(t.drv).name),fmt(t.dep),`${filled(t)}/${veh(t.veh).cap}`,badge(t.status)])));
};

P.users=()=>head("Users","Manage passengers, drivers and admins.",`<button class="btn primary" onclick="A.userForm()">+ Add User</button>`)+
 card("All accounts",tbl(["ID","Name","Email","Role","Status","Actions"],db.users.map(u=>[u.id,esc(u.name),esc(u.email),u.role,badge(u.status),
 `<button class="btn small" onclick="A.userForm('${u.id}')">Edit</button> <button class="btn small ${u.status==="Active"?"danger":"success"}" onclick="A.toggleUser('${u.id}')">${u.status==="Active"?"Deactivate":"Activate"}</button>`])));

P.vehicles=()=>head("Vehicles","Vehicles, documents, insurance and maintenance dates.",`<button class="btn primary" onclick="A.vehForm()">+ Add Vehicle</button>`)+
 card("Fleet",tbl(["Number","Type","Capacity","Insurance expiry","Licence expiry","Next maintenance","Files","Status","Actions"],db.vehicles.map(v=>[v.no,v.type,v.cap,expiry(v.ins),expiry(v.lic),expiry(v.svc),v.files.length?v.files.length+" file(s)":"—",badge(v.status),
 `<button class="btn small" onclick="A.vehForm('${v.id}')">Edit</button> <button class="btn small danger" onclick="A.delVeh('${v.id}')">Remove</button>`])),"Files go to MongoDB");

P.routes=()=>head("Routes","Passenger From/To dropdowns read from these routes.",`<button class="btn primary" onclick="A.routeForm()">+ Add Route</button>`)+
 card("All routes",tbl(["ID","Origin","Destination","Distance","Fare","Actions"],db.routes.map(r=>[r.id,r.from,r.to,r.km+" km",lkr(r.fare),
 `<button class="btn small" onclick="A.routeForm('${r.id}')">Edit</button> <button class="btn small danger" onclick="A.delRoute('${r.id}')">Delete</button>`])));

P.trips=()=>head("Trips","Schedule vehicles and drivers against routes.",`<button class="btn primary" onclick="A.tripForm()">+ Create Trip</button>`)+
 card("Schedule",tbl(["Trip","Route","Vehicle","Driver","Departure","Arrival","Seats","Status","Actions"],[...db.trips].sort((a,b)=>b.dep.localeCompare(a.dep)).map(t=>{const f=filled(t),c=veh(t.veh).cap;return [t.id,rname(t.route),veh(t.veh).no,esc(user(t.drv).name),fmt(t.dep),fmt(t.arr),`<span class="progress"><span style="width:${f/c*100}%"></span></span>${f}/${c}`,badge(t.status),
 t.status==="Scheduled"?`<button class="btn small" onclick="A.tripForm('${t.id}')">Edit</button> <button class="btn small danger" onclick="A.cancelTrip('${t.id}')">Cancel</button>`:`<small style="color:#a29c91">Locked · ${t.status}</small>`]})));

P.bookings=()=>{
 const rows=db.bookings.filter(b=>(!F.bkTrip||b.trip===F.bkTrip)&&(!F.bkDate||b.date===F.bkDate));
 return head("Bookings","View and manage all passenger tickets.",`<div class="filters"><select class="filter" onchange="F.bkTrip=this.value;render()"><option value="">All trips</option>${opts(db.trips.map(t=>[t.id,tripName(t)]),F.bkTrip)}</select><input class="filter" type="date" value="${F.bkDate}" onchange="F.bkDate=this.value;render()"><button class="btn" onclick="F.bkTrip=F.bkDate='';render()">Clear</button></div>`)+
 card("Tickets",tbl(["Ticket","Trip","Passenger","Seat","Fare","Booked","Status","Action"],rows.map(b=>[b.id,tripName(trip(b.trip)),esc(user(b.pax).name),b.seat,lkr(fare(b)),b.date,badge(b.status),
 b.status==="CONFIRMED"?`<button class="btn small danger" onclick="A.cancelBk('${b.id}')">Cancel</button>`:"—"])));
};

P.payments=()=>{
 const rows=db.payments.filter(p=>(!F.payM||p.method===F.payM)&&(!F.payS||p.status===F.payS));
 return head("Payments","Track card and cash payments.",`<div class="filters"><select class="filter" onchange="F.payM=this.value;render()"><option value="">All methods</option>${opts([["CARD","Card"],["CASH","Cash"]],F.payM)}</select><select class="filter" onchange="F.payS=this.value;render()"><option value="">All statuses</option>${opts(["PAID","PENDING","REFUNDED","CANCELLED"].map(x=>[x,x]),F.payS)}</select></div>`)+
 card("Payments",tbl(["Payment","Ticket","Passenger","Amount","Method","Status","Action"],rows.map(p=>{const b=by(db.bookings,p.bk);return [p.id,p.bk,esc(user(b.pax).name),lkr(fare(b)),p.method,badge(p.status),
 p.status==="PENDING"&&p.method==="CASH"?`<button class="btn small success" onclick="A.pay('${p.id}','PAID')">Mark PAID</button>`:p.status==="PAID"?`<button class="btn small danger" onclick="A.pay('${p.id}','REFUNDED')">Refund</button>`:"—"]})));
};

P.reviews=()=>{
 const rt=key=>{const m={};db.reviews.forEach(r=>{const t=trip(r.trip);(m[t[key]]??=[]).push(r.rating)});return Object.entries(m).map(([k,a])=>[k,avg(a),a.length]).sort((a,b)=>b[1]-a[1])};
 return head("Reviews","Moderate feedback and see top performers.")+
 `<div class="grid-eq">${card("Top-rated drivers",tbl(["Driver","Rating","Reviews"],rt("drv").map(([k,a,n])=>[esc(user(k).name),stars(a)+" "+a.toFixed(1),n])))}
 ${card("Top-rated vehicles",tbl(["Vehicle","Rating","Reviews"],rt("veh").map(([k,a,n])=>[veh(k).no,stars(a)+" "+a.toFixed(1),n])))}</div>`+
 card("All reviews",`<div class="card-body">${db.reviews.length?db.reviews.map(r=>`<div class="notice"><b>${tripName(trip(r.trip))}</b> · ${esc(user(trip(r.trip).drv).name)} · by ${esc(user(r.by).name)}<div>${stars(r.rating)}</div><p>${esc(r.comment)}</p><small>${r.date}</small> <button class="btn small danger" onclick="A.delReview('${r.id}')">Delete</button></div>`).join(""):'<div class="empty">No reviews.</div>'}</div>`);
};

P.announcements=()=>head("Announcements","Notices shown to passengers and drivers (MongoDB).",`<button class="btn primary" onclick="A.annForm()">+ New Announcement</button>`)+
 (db.ann.map(a=>`<div class="notice"><b>${esc(a.title)}</b><p>${esc(a.body)}</p><small>${a.date}</small> <button class="btn small" onclick="A.annForm('${a.id}')">Edit</button> <button class="btn small danger" onclick="A.delAnn('${a.id}')">Delete</button></div>`).join("")||'<div class="empty">No announcements.</div>');

let RPT=null;
const EMPTY_RPT=()=>({rev:[],busy:[],perTrip:[],drv:[],pm:[]});
function reportData(){return RPT||EMPTY_RPT()}
async function loadReports(){try{RPT=await api("GET","/api/reports?from="+F.from+"&to="+F.to)}catch(e){toast(e.message)}render()}
const _go=go;go=function(p){if(p==="reports")RPT=null;_go(p)};
P.reports=()=>{if(RPT===null){RPT=EMPTY_RPT();setTimeout(loadReports,0)}const d=reportData();
 return head("Reports","Operational and financial reports (Oracle).",`<div class="filters"><input class="filter" type="date" value="${F.from}" onchange="F.from=this.value;loadReports()"><input class="filter" type="date" value="${F.to}" onchange="F.to=this.value;loadReports()"><button class="btn" onclick="F.from=F.to='';loadReports()">Clear</button><button class="btn primary" onclick="A.exportCsv()">Export CSV</button></div>`)+
 `<div class="grid-eq">${card("Revenue per route",tbl(["Route","Revenue"],d.rev.map(([n,v])=>[n,lkr(v)])))}${card("Busiest routes",tbl(["Route","Tickets"],d.busy))}</div>`+
 card("Tickets sold per trip",tbl(["Trip","Tickets","Capacity","Seats filled"],d.perTrip.map(r=>[r[0],r[1],r[2],`<span class="progress"><span style="width:${r[3]}%"></span></span>${r[3]}%`])))+
 `<div class="grid-eq">${card("Driver performance",tbl(["Driver","Trips","Avg rating"],d.drv.map(r=>[esc(r[0]),r[1],r[2]?stars(r[2])+" "+r[2].toFixed(1):"—"])))}${card("Payment methods",tbl(["Method","Payments","Amount"],d.pm.map(([m,[c,a]])=>[m,c,lkr(a)])))}</div>`;
};

Object.assign(A,{
 userForm(id){const u=by(db.users,id);
  modal(id?"Edit User":"Add User",[
   {k:"name",l:"Full name",v:u.name||"",full:1},{k:"email",l:"Email",t:"email",v:u.email||""},
   {k:"role",l:"Role",t:"select",o:["Passenger","Driver","Admin"].map(x=>[x,x]),v:u.role||"Passenger"},
   {k:"status",l:"Status",t:"select",o:[["Active","Active"],["Inactive","Inactive"]],v:u.status||"Active"},
   ...(id?[]:[{k:"password",l:"Temporary password",t:"password",v:""}])],async v=>{
   if(!v.name||!/^\S+@\S+\.\S+$/.test(v.email))return"Enter a name and a valid email.";
   if(id&&id===me.id&&(v.role!=="Admin"||v.status!=="Active"))return"You can't remove your own admin access.";
   if(!id&&(v.password||"").length<6)return"Password needs 6+ characters.";
   await api(id?"PUT":"POST",id?"/api/users/"+id:"/api/users",v);toast("User saved")})},
 toggleUser(id){if(id===me.id)return toast("You can't deactivate yourself.");const u=by(db.users,id);
  act(()=>api("PUT","/api/users/"+id,{name:u.name,email:u.email,role:u.role,status:u.status==="Active"?"Inactive":"Active"}))},
 vehForm(id){const v=by(db.vehicles,id);
  modal(id?"Edit Vehicle":"Add Vehicle",[
   {k:"no",l:"Vehicle number",v:v.no||""},{k:"type",l:"Type",t:"select",o:[["Bus","Bus"],["Van","Van"]],v:v.type||"Bus"},
   {k:"cap",l:"Capacity",t:"number",v:v.cap||""},{k:"status",l:"Status",t:"select",o:["Active","Maintenance"].map(x=>[x,x]),v:v.status||"Active"},
   {k:"ins",l:"Insurance expiry",t:"date",v:v.ins||""},{k:"lic",l:"Licence expiry",t:"date",v:v.lic||""},
   {k:"svc",l:"Next maintenance",t:"date",v:v.svc||""},
   {k:"files",l:"Photos / documents (MongoDB)",t:"file",full:1}],async f=>{
   if(!f.no||!(+f.cap>0)||!f.ins||!f.lic||!f.svc)return"Fill in number, capacity and all three dates.";
   const fd=new FormData();["no","type","cap","status","ins","lic","svc"].forEach(k=>fd.append(k,f[k]));
   f.files.forEach(x=>fd.append("files",x));
   await api(id?"PUT":"POST",id?"/api/vehicles/"+id:"/api/vehicles",fd);toast("Vehicle saved")})},
 delVeh(id){if(db.trips.some(t=>t.veh===id))return toast("Vehicle is used in trips; set it to Maintenance instead.");
  confirmDo("Remove this vehicle?",()=>api("DELETE","/api/vehicles/"+id))},
 routeForm(id){const r=by(db.routes,id);
  modal(id?"Edit Route":"Add Route",[{k:"from",l:"Origin",v:r.from||""},{k:"to",l:"Destination",v:r.to||""},{k:"km",l:"Distance (km)",t:"number",v:r.km||""},{k:"fare",l:"Fare (LKR)",t:"number",v:r.fare||""}],async v=>{
   if(!v.from||!v.to||v.from.toLowerCase()===v.to.toLowerCase())return"Origin and destination must be different.";
   if(!(+v.km>0)||!(+v.fare>0))return"Distance and fare must be positive.";
   await api(id?"PUT":"POST",id?"/api/routes/"+id:"/api/routes",{from:v.from,to:v.to,km:+v.km,fare:+v.fare});toast("Route saved")})},
 delRoute(id){if(db.trips.some(t=>t.route===id))return toast("Route is used by trips.");
  confirmDo("Delete this route?",()=>api("DELETE","/api/routes/"+id))},
 tripForm(id){const t=by(db.trips,id);
  modal(id?"Edit Trip":"Create Trip",[
   {k:"route",l:"Route",t:"select",o:db.routes.map(r=>[r.id,rname(r.id)]),v:t.route},
   {k:"veh",l:"Vehicle",t:"select",o:db.vehicles.filter(v=>v.status==="Active").map(v=>[v.id,`${v.no} (${v.type}, ${v.cap})`]),v:t.veh},
   {k:"drv",l:"Driver",t:"select",o:drivers().map(d=>[d.id,d.name]),v:t.drv},
   {k:"dep",l:"Departure",t:"datetime-local",v:t.dep||""},{k:"arr",l:"Arrival",t:"datetime-local",v:t.arr||""}],async v=>{
   if(!v.route||!v.veh||!v.drv||!v.dep||!v.arr)return"Fill in every field.";
   if(v.arr<=v.dep)return"Arrival must be after departure.";
   await api(id?"PUT":"POST",id?"/api/trips/"+id:"/api/trips",v);toast("Trip saved")})},
 cancelTrip(id){confirmDo("Cancel this trip? Its tickets will be cancelled too.",()=>api("POST","/api/trips/"+id+"/cancel"))},
 cancelBk(id){confirmDo("Cancel this ticket?",()=>api("POST","/api/tickets/"+id+"/cancel"))},
 pay(id,s){act(async()=>{await api("POST","/api/payments/"+id+"/status",{status:s});toast("Payment "+s)})},
 delReview(id){confirmDo("Delete this review?",()=>api("DELETE","/api/reviews/"+id))},
 annForm(id){const a=by(db.ann,id);
  modal(id?"Edit Announcement":"New Announcement",[{k:"title",l:"Title",v:a.title||"",full:1},{k:"body",l:"Notice",t:"textarea",v:a.body||"",full:1}],async v=>{
   if(!v.title||!v.body)return"Title and notice are required.";
   await api(id?"PUT":"POST",id?"/api/announcements/"+id:"/api/announcements",{title:v.title,body:v.body});toast("Announcement saved")})},
 delAnn(id){confirmDo("Delete this announcement?",()=>api("DELETE","/api/announcements/"+id))},
 exportCsv(){const d=reportData(),L=[["Revenue per route"],...d.rev.map(([n,v])=>[n,v]),[],["Busiest routes"],...d.busy,[],["Tickets per trip","Tickets","Capacity","Fill %"],...d.perTrip,[],["Driver","Trips","Avg rating"],...d.drv.map(r=>[r[0],r[1],r[2].toFixed(1)]),[],["Payment method","Count","Amount"],...d.pm.map(([m,[c,a]])=>[m,c,a])];
  const csv=L.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="smartmove-report.csv";a.click()}
});

boot("Admin",NAV,P);