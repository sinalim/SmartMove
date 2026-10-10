// SmartMove - MongoDB setup. Paste in Studio 3T IntelliShell and run all.
// Oracle ids (user_id, trip_id, vehicle_id, feedback_id) are stored as plain numbers.
const sm = db.getSiblingDB("smartmove");
["announcements", "reviews", "vehicle_documents"].forEach(c => sm.getCollection(c).drop());

// 1. announcements  (admin creates/edits/deletes; passengers + drivers read)
sm.createCollection("announcements", { validator: { $jsonSchema: {
  bsonType: "object", required: ["title", "body", "createdAt"],
  properties: {
    title: { bsonType: "string", minLength: 1 },
    body: { bsonType: "string", minLength: 1 },
    createdBy: { bsonType: "number" },          // Oracle App_User.user_id (admin)
    createdAt: { bsonType: "date" }
  } } } });

// 2. reviews  (comment text; the rating itself is in Oracle Feedback)
sm.createCollection("reviews", { validator: { $jsonSchema: {
  bsonType: "object", required: ["feedbackId", "tripId", "passengerId", "comment", "createdAt"],
  properties: {
    feedbackId: { bsonType: "number" },         // Oracle Feedback.feedback_id
    tripId: { bsonType: "number" },
    passengerId: { bsonType: "number" },
    comment: { bsonType: "string", minLength: 1, maxLength: 500 },
    createdAt: { bsonType: "date" }
  } } } });

// 3. vehicle_documents  (photos / documents; keep files under ~5 MB)
sm.createCollection("vehicle_documents", { validator: { $jsonSchema: {
  bsonType: "object", required: ["vehicleId", "fileName", "uploadedAt"],
  properties: {
    vehicleId: { bsonType: "number" },          // Oracle Vehicle.vehicle_id
    fileName: { bsonType: "string" },
    docType: { enum: ["PHOTO", "DOCUMENT"] },
    contentType: { bsonType: "string" },
    size: { bsonType: "number" },
    data: { bsonType: "binData" },              // the file itself
    uploadedBy: { bsonType: "number" },
    uploadedAt: { bsonType: "date" }
  } } } });

// Indexes
sm.announcements.createIndex({ createdAt: -1 });
sm.reviews.createIndex({ feedbackId: 1 }, { unique: true });
sm.reviews.createIndex({ tripId: 1 });
sm.vehicle_documents.createIndex({ vehicleId: 1 });

// Sample data (matches the Oracle sample data)
const day = 86400000, now = Date.now();
sm.announcements.insertMany([
  { title: "Route update", body: "Kandy to Colombo departures may be delayed by 15 minutes due to road works.", createdBy: 1, createdAt: new Date(now) },
  { title: "Vehicle notice", body: "SM-3091 is under maintenance. Check the trip schedule for changes.", createdBy: 1, createdAt: new Date(now - day) }
]);
sm.reviews.insertMany([
  { feedbackId: 1, tripId: 4, passengerId: 4, comment: "Very comfortable trip.", createdAt: new Date(now - day) },
  { feedbackId: 2, tripId: 5, passengerId: 5, comment: "Driver was helpful.",    createdAt: new Date(now - 2 * day) },
  { feedbackId: 3, tripId: 5, passengerId: 4, comment: "Left a bit late.",       createdAt: new Date(now - 2 * day) }
]);

// Check
printjson(sm.getCollectionNames());
printjson(sm.announcements.find().toArray());
