// SmartMove API - Express + Oracle (node-oracledb) + MongoDB. Serves the UI from ../frontend.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const oracledb = require("oracledb");
const { MongoClient, ObjectId, Binary } = require("mongodb");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

const SECRET = process.env.JWT_SECRET || "smartmove-dev-secret";
const app = express();
app.use(express.json());
// serve only the UI files from ../frontend (never server.js or .env)
const UI_FILES = new Set(["index.html","admin.html","driver.html","passenger.html","shared.js","admin.js","driver.js","passenger.js","styles.css"]);
app.use((req, res, next) => {
  const f = req.path === "/" ? "index.html" : req.path.slice(1);
  if (req.method === "GET" && UI_FILES.has(f)) return res.sendFile(path.join(__dirname, "..", "frontend", f));
  next();
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 10 } });

let pool, M; // Oracle pool, Mongo db

/* ---------- helpers ---------- */
async function q(sql, binds = {}) {
  const c = await pool.getConnection();
  try { return await c.execute(sql, binds); } finally { await c.close(); }
}
const rows = async (sql, b) => (await q(sql, b)).rows;
const OUT = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
const N = v => ({ val: v == null || v === "" ? null : Number(v), type: oracledb.NUMBER });
const S = v => (v == null ? "" : String(v));
const tc = s => String(s || "").split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
const up = s => String(s || "").toUpperCase().replace(/ /g, "_");
const ymd = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const T_FMT = `'YYYY-MM-DD"T"HH24:MI'`;

// turns ORA-20xxx / constraint errors into a short message for the UI
function msg(e) {
  const m = /ORA-20\d\d\d: ([^\n]*)/.exec(e.message || "");
  if (m) return m[1];
  if (/ORA-00001/.test(e.message)) return "That value already exists (duplicate).";
  if (/ORA-02292/.test(e.message)) return "It is in use and cannot be deleted.";
  if (/ORA-02290|ORA-12899|ORA-01722/.test(e.message)) return "Invalid value entered.";
  return String(e.message || "Error").split("\n")[0];
}
const h = fn => async (req, res) => {
  try { res.json((await fn(req, res)) || { ok: true }); }
  catch (e) { console.error(e.message); res.status(400).json({ error: msg(e) }); }
};
const auth = (...roles) => (req, res, next) => {
  try {
    const p = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), SECRET);
    if (roles.length && !roles.includes(p.role)) return res.status(403).json({ error: "Not allowed." });
    req.u = p; next();
  } catch (e) { res.status(401).json({ error: "Please log in again." }); }
};
const session = u => ({
  token: jwt.sign({ id: S(u.id), role: tc(u.role) }, SECRET, { expiresIn: "8h" }),
  user: { id: S(u.id), name: u.name, email: u.email, role: tc(u.role) }
});

/* ---------- auth ---------- */
app.post("/api/login", h(async req => {
  const { id, password } = req.body;
  const r = await rows(
    `SELECT u.user_id "id", u.full_name "name", u.email "email", u.role "role", u.status "status"
       FROM App_User u LEFT JOIN Driver d ON d.driver_id = u.user_id
      WHERE (LOWER(u.username) = :i OR LOWER(u.email) = :i OR LOWER(d.license_no) = :i)
        AND u.password_hash = RAWTOHEX(STANDARD_HASH(:pw, 'SHA256'))`,
    { i: String(id || "").trim().toLowerCase(), pw: String(password || "") });
  if (!r.length) throw new Error("Wrong login or password.");
  if (r[0].status !== "ACTIVE") throw new Error("This account is deactivated.");
  return session(r[0]);
}));

app.post("/api/signup", h(async req => {
  const { name, email, password, role } = req.body;
  if (!["Passenger", "Driver"].includes(role)) throw new Error("Invalid role.");
  if (!name || !/^\S+@\S+\.\S+$/.test(email || "") || String(password || "").length < 6)
    throw new Error("Check your name, email and password (6+ characters).");
  const r = await q("BEGIN create_user_proc(:n, :e, :p, :r, :id); END;",
    { n: name, e: email, p: password, r: role, id: OUT });
  return session({ id: r.outBinds.id, name, email: email.toLowerCase(), role: role.toUpperCase() });
}));

app.post("/api/password", auth(), h(async req => {
  await q("BEGIN change_password_proc(:u, :o, :n); END;", { u: Number(req.u.id), o: req.body.old, n: req.body.new });
}));

app.put("/api/profile", auth(), h(async req => {
  const { name, email } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || "")) throw new Error("Enter your name and a valid email.");
  await q("UPDATE App_User SET full_name = :n, email = LOWER(:e) WHERE user_id = :i", { n: name, e: email, i: Number(req.u.id) });
}));

/* ---------- bootstrap: everything the UI needs, filtered by role ---------- */
app.get("/api/bootstrap", auth(), h(async req => {
  const me = Number(req.u.id), role = req.u.role;
  const A = role === "Admin", D = role === "Driver", P = role === "Passenger";

  const [now] = await rows(`SELECT TO_CHAR(SYSDATE,'YYYY-MM-DD') "today", TO_CHAR(SYSDATE,${T_FMT}) "now" FROM dual`);

  const users = (await rows(`SELECT user_id "id", full_name "name", email "email", role "role", status "status" FROM App_User ORDER BY user_id`))
    .map(u => ({ id: S(u.id), name: u.name, email: (A || u.id === me) ? u.email : "", role: tc(u.role), status: tc(u.status) }));

  const docs = P ? [] : await M.collection("vehicle_documents").find({}, { projection: { data: 0 } }).toArray();
  const vehicles = (await rows(`SELECT vehicle_id "id", reg_number "no", vehicle_type "type", capacity "cap",
        TO_CHAR(insurance_expiry,'YYYY-MM-DD') "ins", TO_CHAR(licence_expiry,'YYYY-MM-DD') "lic",
        TO_CHAR(next_service,'YYYY-MM-DD') "svc", status "status" FROM Vehicle ORDER BY vehicle_id`))
    .map(v => ({ id: S(v.id), no: v.no, type: tc(v.type), cap: v.cap, ins: v.ins, lic: v.lic, svc: v.svc,
      status: tc(v.status), files: docs.filter(d => d.vehicleId === v.id).map(d => d.fileName) }));

  const routes = (await rows(`SELECT route_id "id", origin "from", destination "to", distance_km "km", base_fare "fare" FROM Route ORDER BY route_id`))
    .map(r => ({ ...r, id: S(r.id) }));

  const tripSql = `SELECT trip_id "id", route_id "route", vehicle_id "veh", driver_id "drv",
        TO_CHAR(departure_time,${T_FMT}) "dep", TO_CHAR(arrival_time,${T_FMT}) "arr", status "status" FROM Trip`;
  const trips = (D ? await rows(tripSql + " WHERE driver_id = :d ORDER BY trip_id", { d: me }) : await rows(tripSql + " ORDER BY trip_id"))
    .map(t => ({ id: S(t.id), route: S(t.route), veh: S(t.veh), drv: S(t.drv), dep: t.dep, arr: t.arr, status: tc(t.status) }));

  const bkSql = `SELECT t.ticket_id "id", t.trip_id "trip", t.passenger_id "pax", t.seat_no "seat",
        TO_CHAR(t.booking_date,'YYYY-MM-DD') "date", t.status "status", t.boarded "boarded" FROM Ticket t`;
  let bk = D ? await rows(bkSql + " JOIN Trip tr ON tr.trip_id = t.trip_id WHERE tr.driver_id = :d ORDER BY t.ticket_id", { d: me })
             : await rows(bkSql + " ORDER BY t.ticket_id");
  if (P) bk = bk.filter(b => b.pax === me || b.status === "BOOKED");
  const bookings = bk.map(b => ({ id: S(b.id), trip: S(b.trip), pax: (P && b.pax !== me) ? "" : S(b.pax), seat: b.seat,
    date: b.date, status: b.status === "BOOKED" ? "CONFIRMED" : "CANCELLED", boarded: !!b.boarded }));

  const paySql = `SELECT p.payment_id "id", p.ticket_id "bk", p.payment_method "method", p.payment_status "status",
        TO_CHAR(p.payment_date,'YYYY-MM-DD') "date", p.card_last4 "card4" FROM Payment p`;
  const pay = A ? await rows(paySql + " ORDER BY p.payment_id")
    : D ? await rows(paySql + " JOIN Ticket t ON t.ticket_id = p.ticket_id JOIN Trip tr ON tr.trip_id = t.trip_id WHERE tr.driver_id = :d ORDER BY p.payment_id", { d: me })
        : await rows(paySql + " JOIN Ticket t ON t.ticket_id = p.ticket_id WHERE t.passenger_id = :p ORDER BY p.payment_id", { p: me });
  const payments = pay.map(p => ({ id: S(p.id), bk: S(p.bk), method: p.method, status: p.status, date: p.date, card4: p.card4 || "" }));

  const fbSql = `SELECT f.feedback_id "id", f.trip_id "trip", f.passenger_id "by", f.rating "rating",
        TO_CHAR(f.feedback_date,'YYYY-MM-DD') "date" FROM Feedback f`;
  const fb = A ? await rows(fbSql + " ORDER BY f.feedback_id")
    : D ? await rows(fbSql + " JOIN Trip tr ON tr.trip_id = f.trip_id WHERE tr.driver_id = :d ORDER BY f.feedback_id", { d: me })
        : await rows(fbSql + " WHERE f.passenger_id = :p ORDER BY f.feedback_id", { p: me });
  const cm = fb.length ? await M.collection("reviews").find({ feedbackId: { $in: fb.map(f => f.id) } }).toArray() : [];
  const reviews = fb.map(f => ({ id: S(f.id), trip: S(f.trip), by: S(f.by), rating: f.rating, date: f.date,
    comment: (cm.find(c => c.feedbackId === f.id) || {}).comment || "" }));

  const maint = P ? [] : (await rows(`SELECT maintenance_id "id", vehicle_id "veh", maintenance_type "type", description "desc",
        reported_by "by", TO_CHAR(maintenance_date,'YYYY-MM-DD') "date", status "status" FROM Maintenance ORDER BY maintenance_id`))
    .map(m => ({ id: S(m.id), veh: S(m.veh), type: tc(m.type), desc: m.desc, by: S(m.by), date: m.date, status: tc(m.status) }));

  const ann = (await M.collection("announcements").find().sort({ createdAt: -1 }).toArray())
    .map(a => ({ id: a._id.toString(), title: a.title, body: a.body, date: ymd(a.createdAt) }));

  return { today: now.today, now: now.now, db: { users, vehicles, routes, trips, bookings, payments, reviews, ann, maint } };
}));

/* ---------- admin: users ---------- */
app.post("/api/users", auth("Admin"), h(async req => {
  const { name, email, role, status, password } = req.body;
  if (String(password || "").length < 6) throw new Error("Password needs 6+ characters.");
  const r = await q("BEGIN create_user_proc(:n, :e, :p, :r, :id); END;", { n: name, e: email, p: password, r: role, id: OUT });
  if (status === "Inactive") await q("UPDATE App_User SET status = 'INACTIVE' WHERE user_id = :i", { i: r.outBinds.id });
}));
app.put("/api/users/:id", auth("Admin"), h(async req => {
  const id = Number(req.params.id), { name, email, role, status } = req.body;
  if (id === Number(req.u.id) && (role !== "Admin" || status !== "Active")) throw new Error("You can't remove your own admin access.");
  await q("UPDATE App_User SET full_name = :n, email = LOWER(:e), status = :s WHERE user_id = :i", { n: name, e: email, s: up(status), i: id });
  await q("BEGIN set_user_role_proc(:i, :r); END;", { i: id, r: role });
}));

/* ---------- vehicles (Oracle) + files (MongoDB) ---------- */
async function saveFiles(vehicleId, req) {
  const files = req.files || [];
  if (!files.length) return;
  await M.collection("vehicle_documents").insertMany(files.map(f => ({
    vehicleId: Number(vehicleId), fileName: f.originalname,
    docType: f.mimetype.startsWith("image/") ? "PHOTO" : "DOCUMENT",
    contentType: f.mimetype, size: f.size, data: new Binary(f.buffer),
    uploadedBy: Number(req.u.id), uploadedAt: new Date()
  })));
}
const vb = b => ({ rn: b.no, vt: up(b.type), cap: Number(b.cap), ins: b.ins, lic: b.lic, svc: b.svc, st: up(b.status) });
app.post("/api/vehicles", auth("Admin"), upload.array("files"), h(async req => {
  const r = await q(`INSERT INTO Vehicle(vehicle_id, reg_number, vehicle_type, capacity, insurance_expiry, licence_expiry, next_service, status)
      VALUES (vehicle_seq.NEXTVAL, :rn, :vt, :cap, TO_DATE(:ins,'YYYY-MM-DD'), TO_DATE(:lic,'YYYY-MM-DD'), TO_DATE(:svc,'YYYY-MM-DD'), :st)
      RETURNING vehicle_id INTO :id`, { ...vb(req.body), id: OUT });
  await saveFiles(r.outBinds.id[0], req);
}));
app.put("/api/vehicles/:id", auth("Admin"), upload.array("files"), h(async req => {
  await q(`UPDATE Vehicle SET reg_number=:rn, vehicle_type=:vt, capacity=:cap, insurance_expiry=TO_DATE(:ins,'YYYY-MM-DD'),
      licence_expiry=TO_DATE(:lic,'YYYY-MM-DD'), next_service=TO_DATE(:svc,'YYYY-MM-DD'), status=:st WHERE vehicle_id=:id`,
    { ...vb(req.body), id: Number(req.params.id) });
  await saveFiles(req.params.id, req);
}));
app.post("/api/vehicles/:id/files", auth("Admin", "Driver"), upload.array("files"), h(async req => {
  if (!(req.files || []).length) throw new Error("Choose at least one file.");
  await saveFiles(req.params.id, req);
}));
app.delete("/api/vehicles/:id", auth("Admin"), h(async req => {
  await q("DELETE FROM Vehicle WHERE vehicle_id = :i", { i: Number(req.params.id) });
  await M.collection("vehicle_documents").deleteMany({ vehicleId: Number(req.params.id) });
}));

/* ---------- routes ---------- */
const rb = b => ({ o: b.from, d: b.to, km: Number(b.km), fare: Number(b.fare) });
app.post("/api/routes", auth("Admin"), h(async req => {
  await q("INSERT INTO Route(route_id, origin, destination, distance_km, base_fare) VALUES (route_seq.NEXTVAL, :o, :d, :km, :fare)", rb(req.body));
}));
app.put("/api/routes/:id", auth("Admin"), h(async req => {
  await q("UPDATE Route SET origin=:o, destination=:d, distance_km=:km, base_fare=:fare WHERE route_id=:i", { ...rb(req.body), i: Number(req.params.id) });
}));
app.delete("/api/routes/:id", auth("Admin"), h(async req => {
  await q("DELETE FROM Route WHERE route_id = :i", { i: Number(req.params.id) });
}));

/* ---------- trips ---------- */
const saveTrip = (id, b) => q(
  `BEGIN save_trip_proc(:id, :rt, :vh, :dr, TO_TIMESTAMP(:dep, ${T_FMT}), TO_TIMESTAMP(:arr, ${T_FMT})); END;`,
  { id: { dir: oracledb.BIND_INOUT, type: oracledb.NUMBER, val: id }, rt: Number(b.route), vh: Number(b.veh), dr: Number(b.drv), dep: b.dep, arr: b.arr });
app.post("/api/trips", auth("Admin"), h(async req => { await saveTrip(null, req.body); }));
app.put("/api/trips/:id", auth("Admin"), h(async req => { await saveTrip(Number(req.params.id), req.body); }));
app.post("/api/trips/:id/cancel", auth("Admin"), h(async req => {
  await q("BEGIN cancel_trip_proc(:t); END;", { t: Number(req.params.id) });
}));
app.post("/api/trips/:id/status", auth("Driver"), h(async req => {
  await q("BEGIN set_trip_status_proc(:t, :d, :s); END;", { t: Number(req.params.id), d: Number(req.u.id), s: up(req.body.status) });
}));

/* ---------- tickets / payments ---------- */
app.post("/api/book", auth("Passenger"), h(async req => {
  const { trip, seat, method, card4 } = req.body;
  await q("BEGIN book_ticket_proc(:t, :p, :s, :m, :c, :id); END;",
    { t: Number(trip), p: Number(req.u.id), s: Number(seat), m: method,
      c: { val: card4 || null, type: oracledb.STRING }, id: OUT });
}));
app.post("/api/tickets/:id/cancel", auth("Admin", "Passenger"), h(async req => {
  await q("BEGIN cancel_ticket_proc(:t, :p); END;",
    { t: Number(req.params.id), p: N(req.u.role === "Passenger" ? req.u.id : null) });
}));
app.post("/api/tickets/:id/board", auth("Driver"), h(async req => {
  await q("UPDATE Ticket SET boarded = :b WHERE ticket_id = :t AND trip_id IN (SELECT trip_id FROM Trip WHERE driver_id = :d)",
    { b: req.body.boarded ? 1 : 0, t: Number(req.params.id), d: Number(req.u.id) });
}));
app.post("/api/payments/:id/status", auth("Admin", "Driver"), h(async req => {
  await q("BEGIN set_payment_proc(:p, :s, :d); END;",
    { p: Number(req.params.id), s: req.body.status, d: N(req.u.role === "Driver" ? req.u.id : null) });
}));

/* ---------- reviews (rating = Oracle, comment = MongoDB) ---------- */
app.post("/api/reviews", auth("Passenger"), h(async req => {
  const { trip, rating, comment } = req.body;
  if (!comment || comment.length > 500) throw new Error("Comment is required (max 500 characters).");
  const r = await q("BEGIN add_feedback_proc(:p, :t, :r, :id); END;", { p: Number(req.u.id), t: Number(trip), r: Number(rating), id: OUT });
  await M.collection("reviews").insertOne({ feedbackId: r.outBinds.id, tripId: Number(trip), passengerId: Number(req.u.id), comment, createdAt: new Date() });
}));
app.delete("/api/reviews/:id", auth("Admin"), h(async req => {
  const id = Number(req.params.id);
  await q("DELETE FROM Feedback WHERE feedback_id = :f", { f: id });
  await M.collection("reviews").deleteOne({ feedbackId: id });
}));

/* ---------- announcements (MongoDB) ---------- */
app.post("/api/announcements", auth("Admin"), h(async req => {
  const { title, body } = req.body;
  if (!title || !body) throw new Error("Title and notice are required.");
  await M.collection("announcements").insertOne({ title, body, createdBy: Number(req.u.id), createdAt: new Date() });
}));
app.put("/api/announcements/:id", auth("Admin"), h(async req => {
  const { title, body } = req.body;
  if (!title || !body) throw new Error("Title and notice are required.");
  await M.collection("announcements").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { title, body } });
}));
app.delete("/api/announcements/:id", auth("Admin"), h(async req => {
  await M.collection("announcements").deleteOne({ _id: new ObjectId(req.params.id) });
}));

/* ---------- driver: report a vehicle problem ---------- */
app.post("/api/maintenance", auth("Driver"), h(async req => {
  const { veh, type, desc } = req.body;
  if (!desc) throw new Error("Describe the problem first.");
  const [ok] = await rows("SELECT COUNT(*) \"n\" FROM Trip WHERE driver_id = :d AND vehicle_id = :v", { d: Number(req.u.id), v: Number(veh) });
  if (!ok.n) throw new Error("That vehicle is not on your trips.");
  await q(`INSERT INTO Maintenance(maintenance_id, vehicle_id, reported_by, maintenance_type, description, status)
           VALUES (maintenance_seq.NEXTVAL, :v, :d, :t, :ds, 'REPORTED')`,
    { v: Number(veh), d: Number(req.u.id), t: up(type), ds: String(desc).slice(0, 200) });
}));

/* ---------- admin reports (Oracle) ---------- */
app.get("/api/reports", auth("Admin"), h(async req => {
  const b = { f: req.query.from || "1900-01-01", t: req.query.to || "2999-12-31" };
  const W = "tr.departure_time BETWEEN TO_DATE(:f,'YYYY-MM-DD') AND TO_DATE(:t,'YYYY-MM-DD') + 1";
  const route = "r.origin || ' → ' || r.destination";

  const rev = await rows(`SELECT ${route} "n", SUM(p.amount) "v" FROM Payment p
      JOIN Ticket t ON t.ticket_id = p.ticket_id JOIN Trip tr ON tr.trip_id = t.trip_id JOIN Route r ON r.route_id = tr.route_id
     WHERE p.payment_status = 'PAID' AND ${W} GROUP BY r.route_id, r.origin, r.destination ORDER BY 2 DESC`, b);

  const busy = await rows(`SELECT ${route} "n", COUNT(t.ticket_id) "v" FROM Route r JOIN Trip tr ON tr.route_id = r.route_id
      JOIN Ticket t ON t.trip_id = tr.trip_id AND t.status = 'BOOKED'
     WHERE tr.status <> 'CANCELLED' AND ${W} GROUP BY r.route_id, r.origin, r.destination ORDER BY 2 DESC`, b);

  const perTrip = await rows(`SELECT tr.trip_id "id", ${route} "n", COUNT(t.ticket_id) "sold", v.capacity "cap",
        ROUND(COUNT(t.ticket_id) / v.capacity * 100) "pct"
      FROM Trip tr JOIN Route r ON r.route_id = tr.route_id JOIN Vehicle v ON v.vehicle_id = tr.vehicle_id
      LEFT JOIN Ticket t ON t.trip_id = tr.trip_id AND t.status = 'BOOKED'
     WHERE tr.status <> 'CANCELLED' AND ${W}
     GROUP BY tr.trip_id, r.origin, r.destination, tr.departure_time, v.capacity ORDER BY tr.departure_time DESC`, b);

  const drv = await rows(`SELECT u.full_name "n", COUNT(DISTINCT tr.trip_id) "trips", ROUND(AVG(f.rating), 1) "avg"
      FROM Driver d JOIN App_User u ON u.user_id = d.driver_id
      LEFT JOIN Trip tr ON tr.driver_id = d.driver_id AND tr.status <> 'CANCELLED' AND ${W}
      LEFT JOIN Feedback f ON f.trip_id = tr.trip_id
     WHERE u.status = 'ACTIVE' GROUP BY u.user_id, u.full_name ORDER BY u.full_name`, b);

  const pm = await rows(`SELECT p.payment_method "m", COUNT(*) "c", SUM(p.amount) "a" FROM Payment p
      JOIN Ticket t ON t.ticket_id = p.ticket_id JOIN Trip tr ON tr.trip_id = t.trip_id
     WHERE p.payment_status = 'PAID' AND ${W} GROUP BY p.payment_method`, b);

  return {
    rev: rev.map(r => [r.n, r.v]),
    busy: busy.map(r => [r.n, r.v]),
    perTrip: perTrip.map(r => [`${r.id} · ${r.n}`, r.sold, r.cap, r.pct]),
    drv: drv.map(r => [r.n, r.trips, Number(r.avg) || 0]),
    pm: pm.map(r => [r.m, [r.c, r.a]])
  };
}));

/* ---------- start ---------- */
(async () => {
  pool = await oracledb.createPool({
    user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING, poolMin: 1, poolMax: 5
  });
  const client = await MongoClient.connect(process.env.MONGO_URI || "mongodb://localhost:27017");
  M = client.db(process.env.MONGO_DB || "smartmove");
  const port = process.env.PORT || 8080;
  app.listen(port, () => console.log(`SmartMove running at http://localhost:${port}`));
})().catch(e => { console.error("Startup failed:", e.message); process.exit(1); });
