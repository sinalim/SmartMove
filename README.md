# SmartMove Transport Solutions

Data Management 2 (DM2) coursework CW1 - a web application for bus and van trip booking, built with Oracle and MongoDB.

## Team
## Team
| Name | Email |
|------|-------|
| Sinali Mohotti | sinalimohotti@gmail.com |
| Maimoona Ansar | maimoonaansar61@gmail.com |

## About
SmartMove lets passengers search trips, book seats and pay by card or cash. Admins schedule trips, vehicles and drivers, and drivers run their own trips.

## Tech stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express REST API
- Oracle Database: users, routes, vehicles, trips, tickets, payments, maintenance, ratings
- MongoDB: announcements, review comments, vehicle photos and documents

## Features
**Admin**
- Dashboard with trips today, tickets sold, revenue and active vehicles
- Manage users, vehicles, routes and trips (blocks double-booking of a vehicle or driver)
- View and cancel bookings, manage payments, delete reviews
- Create announcements
- Reports: revenue per route, tickets per trip, busiest routes, driver performance, payment methods (date filter and CSV export)

**Passenger**
- Find a trip by from, to and date
- Choose a seat, pay by card or cash, cancel before departure
- Payments, reviews (completed trips only), travel history, announcements

**Driver**
- My trips (start and end a trip)
- Passenger list with boarding checkbox and cash collection
- My vehicle with documents, maintenance reports, my reviews, announcements

## Database design
- Oracle: tables with primary and foreign keys, check constraints, sequences, PL/SQL procedures (booking, cancelling, trip scheduling, payments, feedback), a function, a cursor and 5 business reports
- MongoDB collections: announcements, reviews, vehicle_documents

## Folder structure
- frontend/ - UI pages
- backend/ - server.js (REST API)
- database/ - smartmove_oracle.sql and smartmove_mongo.js
- schema.sql - copy of the Oracle script

## How to run
1. Run database/smartmove_oracle.sql in SQL Developer (as a script).
2. Run database/smartmove_mongo.js in Studio 3T IntelliShell.
3. In the backend folder, copy .env.example to .env and fill in your details.
4. In the backend folder run: npm install, then node server.js
5. Open http://localhost:8080 in your browser.

## Notes
- Passwords are stored as SHA-256 hashes in Oracle.
- Login accepts a username, email or driver licence number.
- The .env file is not on GitHub. Create it from .env.example.
