const NAV=[["PASSENGER",[["dashboard","⌂","Dashboard"],["find-trip","⌕","Find a Trip"],["bookings","▤","Bookings"],["payments","＄","Payments"],["reviews","★","Reviews"],["history","◷","My History"],["announcements","✉","Announcements"]]],
 ["ACCOUNT",[["password","⚿","Change Password"],["logout","↪","Logout"]]]];
const P={};
const PF={from:"",to:"",date:""};let bookId=null;
const myBk=()=>db.bookings.filter(b=>b.pax===me.id);
const payOf=b=>db.payments.find(p=>p.bk===b.id)||{};
const seatsTaken=id=>db.bookings.filter(b=>b.trip===id&&b.status==="CONFIRMED").map(b=>b.seat);
const canCancel=b=>b.status==="CONFIRMED"&&trip(b.trip).status==="Scheduled"&&trip(b.trip).dep>NOW;
const luhn=n=>n.length>=13&&n.length<=19&&[...n].reverse().reduce((s,d,i)=>{d=+d;if(i%2){d*=2;if(d>9)d-=9}return s+d},0)%10===0;

P.dashboard=()=>{
 const m=myBk(),up=m.filter(b=>b.status==="CONFIRMED"&&["Scheduled","In Progress"].includes(trip(b.trip).status));
 const next=up.map(b=>trip(b.trip)).sort((a,b)=>a.dep.localeCompare(b.dep))[0];
 const rv=db.reviews.filter(r=>r.by===me.id);
 return head(`Welcome back, ${esc(me.name.split(" ")[0])}`,"Find your next trip, manage bookings and read announcements.",`<button class="btn primary" onclick="go('find-trip')">Find a Trip</button>`)+
 `<div class="stats">${stat("Upcoming trips",up.length,next?"Next: "+rname(next.route):"Nothing booked","◷")}${stat("Tickets",m.length,m.filter(b=>b.status==="CONFIRMED").length+" confirmed","▤")}${stat("Payments pending",db.payments.filter(p=>p.status==="PENDING"&&m.some(b=>b.id===p.bk)).length,"Cash due on boarding","＄")}${stat("My average review",rv.length?avg(rv.map(r=>r.rating)).toFixed(1):"—","Ratings you gave","★")}</div>`+
 `<h3 class="sub">Latest announcements</h3>`+annList(db.ann.slice(0,2));
};

P["find-trip"]=()=>{
 const froms=[...new Set(db.routes.map(r=>r.from))],tos=[...new Set(db.routes.map(r=>r.to))];
 const rows=db.trips.filter(t=>t.status==="Scheduled"&&t.dep>NOW&&(!PF.from||route(t.route).from===PF.from)&&(!PF.to||route(t.route).to===PF.to)&&(!PF.date||t.dep.startsWith(PF.date)));
 return head("Find a Trip","Search available trips and choose one to book.")+
 `<div class="card"><div class="card-body"><div class="filters"><select class="filter" id="sf"><option value="">From (any)</option>${opts(froms.map(x=>[x,x]),PF.from)}</select><select class="filter" id="st"><option value="">To (any)</option>${opts(tos.map(x=>[x,x]),PF.to)}</select><input class="filter" id="sd" type="date" value="${PF.date}"><button class="btn primary" onclick="A.search()">Search</button><button class="btn" onclick="PF.from=PF.to=PF.date='';render()">Clear</button></div></div></div>`+
 card("Available trips",tbl(["Trip","Route","Vehicle","Departure","Arrival","Fare","Seats left","Action"],rows.map(t=>{const left=veh(t.veh).cap-filled(t);return [t.id,rname(t.route),veh(t.veh).no,fmt(t.dep),fmt(t.arr),lkr(route(t.route).fare),left,left>0?`<button class="btn small primary" onclick="A.book('${t.id}')">Book</button>`:badge("Full")]})));
};

P.book=()=>{
 const t=trip(bookId);
 if(!t.id)return head("Book a Trip","")+`<div class="empty">Pick a trip from Find a Trip first.</div>`;
 const taken=seatsTaken(t.id),free=[...Array(veh(t.veh).cap)].map((_,i)=>i+1).filter(n=>!taken.includes(n));
 return head("Book a Trip","Choose a seat and payment method, then confirm.")+
 `<div class="card"><div class="card-body narrow">
  <div class="field"><label>Trip</label><input class="form-control" value="${esc(tripName(t))} · ${fmt(t.dep)}" readonly></div>
  <div class="field"><label>Seat</label><select class="form-control" id="bk_seat">${opts(free.map(n=>[n,"Seat "+n]))}</select></div>
  <div class="field"><label>Payment method</label><select class="form-control" id="bk_pay" onchange="A.payToggle()"><option value="CARD">Card (paid now)</option><option value="CASH">Cash (pay the driver)</option></select></div>
  <div id="card-box" class="form-grid">
   <div class="field full"><label>Name on card</label><input class="form-control" id="cd_name" autocomplete="off"></div>
   <div class="field full"><label>Card number</label><input class="form-control" id="cd_no" inputmode="numeric" placeholder="4242 4242 4242 4242" autocomplete="off" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim()"></div>
   <div class="field"><label>Expiry (MM/YY)</label><input class="form-control" id="cd_exp" placeholder="12/28" autocomplete="off" oninput="let v=this.value.replace(/\\D/g,'').slice(0,4);this.value=v.length>2?v.slice(0,2)+'/'+v.slice(2):v"></div>
   <div class="field"><label>CVV</label><input class="form-control" id="cd_cvv" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></div>
  </div>
  <div class="fare-box"><span>Fare to pay</span><strong>${lkr(route(t.route).fare)}</strong></div>
  <div class="err" id="bk_err"></div>
  <div class="form-actions"><button class="btn" onclick="go('find-trip')">Back</button><button class="btn primary" onclick="A.confirmBook()">Confirm booking</button></div>
 </div></div>`;
};

P.bookings=()=>head("Bookings","Your tickets. Cancel before departure to free the seat.",`<button class="btn primary" onclick="go('find-trip')">+ Book a Trip</button>`)+
 card("My tickets",tbl(["Ticket ID","Trip","Departure","Seat No","Fare","Payment","Status","Action"],myBk().map(b=>{const p=payOf(b);
 return [b.id,esc(tripName(trip(b.trip))),fmt(trip(b.trip).dep),b.seat,lkr(fare(b)),`${p.method||"—"} · ${p.status||"—"}`,badge(b.status),
 canCancel(b)?`<button class="btn small danger" onclick="A.cancelBk('${b.id}')">Cancel</button>`:"—"]})));

P.payments=()=>head("Payments","Card is PAID at booking. Cash stays PENDING until you pay the driver.")+
 card("My payments",tbl(["Payment ID","Ticket ID","Trip","Amount","Method","Status"],db.payments.filter(p=>myBk().some(b=>b.id===p.bk)).map(p=>{const b=by(db.bookings,p.bk);
 return [p.id,p.bk,esc(rname(trip(b.trip).route)),lkr(fare(b)),p.method+(p.card4?" ····"+p.card4:""),badge(p.status)]})));

P.reviews=()=>{
 const rv=db.reviews.filter(r=>r.by===me.id);
 return head("Reviews","Rate trips you have completed.",`<button class="btn primary" onclick="A.reviewForm()">+ Write Review</button>`)+
 `<div class="stats">${stat("Average rating",rv.length?avg(rv.map(r=>r.rating)).toFixed(1):"—","Across your reviews","★")}${stat("Reviews written",rv.length,"Completed trips only","✎")}</div>`+
 card("My reviews",tbl(["Route","Vehicle","Driver","Rating","Comment","Date"],rv.map(r=>{const t=trip(r.trip);
 return [rname(t.route),veh(t.veh).no,esc(user(t.drv).name),stars(r.rating),esc(r.comment),r.date]})));
};

P.history=()=>{
 const row=b=>[b.id,esc(rname(trip(b.trip).route)),trip(b.trip).dep.slice(0,10),b.seat,lkr(fare(b)),badge(b.status==="CONFIRMED"&&trip(b.trip).status==="Completed"?"Completed":b.status)];
 const H=["Ticket ID","Trip","Date","Seat No","Fare","Status"];
 const up=b=>b.status==="CONFIRMED"&&["Scheduled","In Progress"].includes(trip(b.trip).status);
 return head("My History","Your upcoming and past trips.")+card("Upcoming",tbl(H,myBk().filter(up).map(row)))+card("Past",tbl(H,myBk().filter(b=>!up(b)).map(row)));
};

Object.assign(A,{
 search(){PF.from=$("#sf").value;PF.to=$("#st").value;PF.date=$("#sd").value;render()},
 book(id){bookId=id;go("book")},
 payToggle(){$("#card-box").classList.toggle("hidden",$("#bk_pay").value!=="CARD")},
 async confirmBook(){
  const t=trip(bookId),seat=+$("#bk_seat").value,m=$("#bk_pay").value,e=$("#bk_err");
  if(!t.id||t.status!=="Scheduled"||t.dep<=NOW)return e.textContent="This trip is no longer open for booking.";
  if(!seat||seatsTaken(t.id).includes(seat))return e.textContent="That seat was just taken. Pick another.";
  let card4="";
  if(m==="CARD"){
   const n=$("#cd_no").value.replace(/\D/g,""),x=$("#cd_exp").value,c=$("#cd_cvv").value;
   if(!$("#cd_name").value.trim())return e.textContent="Enter the name on the card.";
   if(!luhn(n))return e.textContent="That card number isn't valid.";
   const mm=+x.slice(0,2),yy=2000+(+x.slice(3,5)),[ty,tm]=TODAY.split("-").map(Number);
   if(!/^\d\d\/\d\d$/.test(x)||mm<1||mm>12)return e.textContent="Expiry must be in MM/YY format.";
   if(yy<ty||(yy===ty&&mm<tm))return e.textContent="This card has expired.";
   if(!/^\d{3,4}$/.test(c))return e.textContent="CVV must be 3 or 4 digits.";
   card4=n.slice(-4);
  }
  try{await api("POST","/api/book",{trip:t.id,seat,method:m,card4});
   toast("Ticket booked");page="bookings";await reload();render()}catch(x){e.textContent=x.message}},
 cancelBk(id){const b=by(db.bookings,id);
  confirmDo("Cancel this ticket? Your seat will be released.",async()=>{
   if(!canCancel(b))return toast("Tickets can only be cancelled before departure.");
   await api("POST","/api/tickets/"+id+"/cancel");toast("Ticket cancelled")})},
 reviewForm(){
  const el=myBk().filter(b=>b.status==="CONFIRMED"&&trip(b.trip).status==="Completed"&&!db.reviews.some(r=>r.by===me.id&&r.trip===b.trip)).map(b=>[b.trip,`${rname(trip(b.trip).route)} · ${trip(b.trip).dep.slice(0,10)}`]);
  if(!el.length)return toast("No completed trips left to review.");
  modal("Write a Review",[{k:"trip",l:"Route (completed trips only)",t:"select",o:el,v:el[0][0],full:1},{k:"rating",l:"Rating",t:"select",o:[5,4,3,2,1].map(n=>[n,n+" ★"]),v:5},{k:"comment",l:"Comment",t:"textarea",v:"",full:1}],async v=>{
   if(trip(v.trip).status!=="Completed")return"You can only review completed trips.";
   if(!v.comment)return"Please add a comment.";
   await api("POST","/api/reviews",{trip:v.trip,rating:+v.rating,comment:v.comment});toast("Review saved")})}
});

boot("Passenger",NAV,P,{book:"Book a Trip"});