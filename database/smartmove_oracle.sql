/* SmartMove - Oracle script (matches the new UI). Needs Oracle 12c+.
   Run all in SQL Developer / SQLcl as your project user. */

/* 1. DROP OLD */
BEGIN
   FOR t IN (SELECT table_name FROM user_tables WHERE table_name IN
     ('PAYMENT','TICKET','FEEDBACK','MAINTENANCE','TRIP','PASSENGER','VEHICLE','DRIVER','ROUTE','APP_USER'))
   LOOP EXECUTE IMMEDIATE 'DROP TABLE '||t.table_name||' CASCADE CONSTRAINTS'; END LOOP;
   FOR s IN (SELECT sequence_name FROM user_sequences WHERE sequence_name IN
     ('USER_SEQ','ROUTE_SEQ','VEHICLE_SEQ','TRIP_SEQ','TICKET_SEQ','PAYMENT_SEQ','MAINTENANCE_SEQ','FEEDBACK_SEQ'))
   LOOP EXECUTE IMMEDIATE 'DROP SEQUENCE '||s.sequence_name; END LOOP;
END;
/

/* 2. TABLES */
CREATE TABLE App_User (            -- login + role (Admin / Driver / Passenger)
   user_id        NUMBER PRIMARY KEY,
   username       VARCHAR2(50)  UNIQUE,            -- e.g. 'admin'
   full_name      VARCHAR2(80)  NOT NULL,
   email          VARCHAR2(100) NOT NULL UNIQUE,
   password_hash  VARCHAR2(64)  NOT NULL,
   role           VARCHAR2(10)  NOT NULL CHECK (role IN ('ADMIN','DRIVER','PASSENGER')),
   status         VARCHAR2(10)  DEFAULT 'ACTIVE' NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
   created_date   DATE DEFAULT SYSDATE
);

CREATE TABLE Driver (              -- driver_id = user_id
   driver_id   NUMBER PRIMARY KEY REFERENCES App_User(user_id),
   license_no  VARCHAR2(30) UNIQUE,
   phone       VARCHAR2(20)
);

CREATE TABLE Passenger (           -- passenger_id = user_id
   passenger_id    NUMBER PRIMARY KEY REFERENCES App_User(user_id),
   phone           VARCHAR2(20),
   passenger_type  VARCHAR2(15) DEFAULT 'REGULAR' CHECK (passenger_type IN ('REGULAR','CORPORATE','STUDENT')),
   registered_date DATE DEFAULT SYSDATE
);

CREATE TABLE Route (
   route_id     NUMBER PRIMARY KEY,
   origin       VARCHAR2(50) NOT NULL,
   destination  VARCHAR2(50) NOT NULL,
   distance_km  NUMBER(6,2),
   base_fare    NUMBER(8,2) NOT NULL CHECK (base_fare > 0),
   CONSTRAINT chk_route_diff CHECK (origin <> destination)
);

CREATE TABLE Vehicle (
   vehicle_id        NUMBER PRIMARY KEY,
   reg_number        VARCHAR2(20) UNIQUE NOT NULL,
   vehicle_type      VARCHAR2(10) CHECK (vehicle_type IN ('BUS','VAN')),
   capacity          NUMBER(3) NOT NULL CHECK (capacity > 0),
   insurance_expiry  DATE,
   licence_expiry    DATE,
   next_service      DATE,
   status            VARCHAR2(15) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MAINTENANCE'))
);

CREATE TABLE Trip (
   trip_id         NUMBER PRIMARY KEY,
   route_id        NUMBER NOT NULL REFERENCES Route(route_id),
   driver_id       NUMBER NOT NULL REFERENCES Driver(driver_id),
   vehicle_id      NUMBER NOT NULL REFERENCES Vehicle(vehicle_id),
   departure_time  TIMESTAMP NOT NULL,
   arrival_time    TIMESTAMP NOT NULL,
   available_seats NUMBER(3) NOT NULL,
   status          VARCHAR2(15) DEFAULT 'SCHEDULED'
                   CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
   CONSTRAINT chk_trip_time CHECK (arrival_time > departure_time)
);

CREATE TABLE Ticket (
   ticket_id     NUMBER PRIMARY KEY,
   trip_id       NUMBER NOT NULL REFERENCES Trip(trip_id),
   passenger_id  NUMBER NOT NULL REFERENCES Passenger(passenger_id),
   seat_no       NUMBER(3) NOT NULL,
   booking_date  DATE DEFAULT SYSDATE,
   fare          NUMBER(8,2) NOT NULL,
   status        VARCHAR2(15) DEFAULT 'BOOKED' CHECK (status IN ('BOOKED','CANCELLED')),
   boarded       NUMBER(1) DEFAULT 0 CHECK (boarded IN (0,1))
);
-- FIX: only BOOKED tickets block a seat, so a cancelled seat can be booked again
CREATE UNIQUE INDEX uq_active_seat ON Ticket
   (CASE WHEN status='BOOKED' THEN trip_id END, CASE WHEN status='BOOKED' THEN seat_no END);

CREATE TABLE Payment (
   payment_id      NUMBER PRIMARY KEY,
   ticket_id       NUMBER NOT NULL UNIQUE REFERENCES Ticket(ticket_id),
   amount          NUMBER(8,2) NOT NULL,
   payment_method  VARCHAR2(10) CHECK (payment_method IN ('CASH','CARD')),
   card_last4      VARCHAR2(4),
   payment_date    DATE DEFAULT SYSDATE,
   payment_status  VARCHAR2(15) DEFAULT 'PENDING'
                   CHECK (payment_status IN ('PAID','PENDING','REFUNDED','CANCELLED'))
);

CREATE TABLE Maintenance (
   maintenance_id   NUMBER PRIMARY KEY,
   vehicle_id       NUMBER NOT NULL REFERENCES Vehicle(vehicle_id),
   reported_by      NUMBER REFERENCES Driver(driver_id),
   maintenance_date DATE DEFAULT SYSDATE,
   maintenance_type VARCHAR2(15) CHECK (maintenance_type IN ('MECHANICAL','ELECTRICAL','TYRE','BODY','OTHER')),
   description      VARCHAR2(200),
   cost             NUMBER(8,2),
   status           VARCHAR2(15) DEFAULT 'REPORTED' CHECK (status IN ('REPORTED','IN_PROGRESS','COMPLETED'))
);

CREATE TABLE Feedback (            -- rating here; comment text is in MongoDB "reviews"
   feedback_id   NUMBER PRIMARY KEY,
   passenger_id  NUMBER NOT NULL REFERENCES Passenger(passenger_id),
   trip_id       NUMBER NOT NULL REFERENCES Trip(trip_id),
   rating        NUMBER(1) NOT NULL CHECK (rating BETWEEN 1 AND 5),
   feedback_date DATE DEFAULT SYSDATE,
   CONSTRAINT uq_one_review UNIQUE (passenger_id, trip_id)
);

/* 3. SEQUENCES */
CREATE SEQUENCE user_seq        START WITH 1;
CREATE SEQUENCE route_seq       START WITH 1;
CREATE SEQUENCE vehicle_seq     START WITH 1;
CREATE SEQUENCE trip_seq        START WITH 1;
CREATE SEQUENCE ticket_seq      START WITH 1;
CREATE SEQUENCE payment_seq     START WITH 1;
CREATE SEQUENCE maintenance_seq START WITH 1;
CREATE SEQUENCE feedback_seq    START WITH 1;

/* 4. SAMPLE DATA - logins from "demo logins.txt".
   Login with username, email OR driver licence no (API login query, see section 7). */
INSERT INTO App_User(user_id,username,full_name,email,password_hash,role,status) VALUES (user_seq.NEXTVAL,'admin','SmartMove Admin','admin@smartmove.lk',RAWTOHEX(STANDARD_HASH('S_TM7YBl','SHA256')),'ADMIN','ACTIVE');
INSERT INTO App_User(user_id,full_name,email,password_hash,role,status) VALUES (user_seq.NEXTVAL,'Nimal Perera','nimal@mail.com',RAWTOHEX(STANDARD_HASH('ISXIInew','SHA256')),'DRIVER','ACTIVE');
INSERT INTO App_User(user_id,full_name,email,password_hash,role,status) VALUES (user_seq.NEXTVAL,'Kamal Silva','kamal@mail.com',RAWTOHEX(STANDARD_HASH('swBxhcPE','SHA256')),'DRIVER','ACTIVE');
INSERT INTO App_User(user_id,full_name,email,password_hash,role,status) VALUES (user_seq.NEXTVAL,'Amal Fernando','amal@mail.com',RAWTOHEX(STANDARD_HASH('hUbHI2L9','SHA256')),'PASSENGER','ACTIVE');
INSERT INTO App_User(user_id,full_name,email,password_hash,role,status) VALUES (user_seq.NEXTVAL,'Sithmi Jayasuriya','sithmi@mail.com',RAWTOHEX(STANDARD_HASH('x1gc7JGH','SHA256')),'PASSENGER','ACTIVE');

INSERT INTO Driver(driver_id,license_no,phone) VALUES (2,'B1234567','0771234567');
INSERT INTO Driver(driver_id,license_no,phone) VALUES (3,'B7654321','0719876543');
INSERT INTO Passenger(passenger_id,phone,passenger_type) VALUES (4,'0701112222','REGULAR');
INSERT INTO Passenger(passenger_id,phone,passenger_type) VALUES (5,'0702223333','STUDENT');

INSERT INTO Route VALUES (route_seq.NEXTVAL,'Kandy','Colombo',116,1850);
INSERT INTO Route VALUES (route_seq.NEXTVAL,'Kandy','Dambulla',72,1150);
INSERT INTO Route VALUES (route_seq.NEXTVAL,'Colombo','Galle',126,2050);
INSERT INTO Route VALUES (route_seq.NEXTVAL,'Kandy','Nuwara Eliya',78,1300);

INSERT INTO Vehicle VALUES (vehicle_seq.NEXTVAL,'SM-1024','BUS',52,DATE '2026-12-18',DATE '2027-03-15',DATE '2026-11-04','ACTIVE');
INSERT INTO Vehicle VALUES (vehicle_seq.NEXTVAL,'SM-2048','VAN',14,DATE '2026-10-25',DATE '2026-12-20',DATE '2026-10-29','ACTIVE');
INSERT INTO Vehicle VALUES (vehicle_seq.NEXTVAL,'SM-3091','BUS',45,DATE '2026-09-20',DATE '2026-11-30',DATE '2026-12-02','MAINTENANCE');

-- trips use dates relative to today so the demo never goes stale
INSERT INTO Trip VALUES (trip_seq.NEXTVAL,1,2,1,TRUNC(SYSDATE)+1+7.5/24,  TRUNC(SYSDATE)+1+11.75/24,50,'SCHEDULED');
INSERT INTO Trip VALUES (trip_seq.NEXTVAL,2,3,2,TRUNC(SYSDATE)+1+9/24,    TRUNC(SYSDATE)+1+11/24,   14,'SCHEDULED');
INSERT INTO Trip VALUES (trip_seq.NEXTVAL,3,2,1,TRUNC(SYSDATE)+1+13/24,   TRUNC(SYSDATE)+1+(16+10/60)/24,51,'SCHEDULED');
INSERT INTO Trip VALUES (trip_seq.NEXTVAL,4,2,1,TRUNC(SYSDATE)-1+8/24,    TRUNC(SYSDATE)-1+10.5/24, 51,'COMPLETED');
INSERT INTO Trip VALUES (trip_seq.NEXTVAL,1,3,1,TRUNC(SYSDATE)-2+7.5/24,  TRUNC(SYSDATE)-2+11.75/24,51,'COMPLETED');
INSERT INTO Trip VALUES (trip_seq.NEXTVAL,2,3,2,TRUNC(SYSDATE)-3+9/24,    TRUNC(SYSDATE)-3+11/24,   13,'COMPLETED');

INSERT INTO Ticket VALUES (ticket_seq.NEXTVAL,1,4,18,SYSDATE-3,1850,'BOOKED',0);
INSERT INTO Ticket VALUES (ticket_seq.NEXTVAL,1,5,19,SYSDATE-2,1850,'BOOKED',0);
INSERT INTO Ticket VALUES (ticket_seq.NEXTVAL,3,4, 7,SYSDATE-2,2050,'BOOKED',0);
INSERT INTO Ticket VALUES (ticket_seq.NEXTVAL,2,5, 3,SYSDATE-2,1150,'CANCELLED',0);
INSERT INTO Ticket VALUES (ticket_seq.NEXTVAL,4,4,12,SYSDATE-4,1300,'BOOKED',1);
INSERT INTO Ticket VALUES (ticket_seq.NEXTVAL,5,5, 5,SYSDATE-5,1850,'BOOKED',1);
INSERT INTO Ticket VALUES (ticket_seq.NEXTVAL,6,4, 4,SYSDATE-6,1150,'BOOKED',1);

INSERT INTO Payment VALUES (payment_seq.NEXTVAL,1,1850,'CARD','4242',SYSDATE-3,'PAID');
INSERT INTO Payment VALUES (payment_seq.NEXTVAL,2,1850,'CASH',NULL,  SYSDATE-2,'PENDING');
INSERT INTO Payment VALUES (payment_seq.NEXTVAL,3,2050,'CARD','4242',SYSDATE-2,'PAID');
INSERT INTO Payment VALUES (payment_seq.NEXTVAL,4,1150,'CASH',NULL,  SYSDATE-2,'CANCELLED');
INSERT INTO Payment VALUES (payment_seq.NEXTVAL,5,1300,'CASH',NULL,  SYSDATE-4,'PAID');
INSERT INTO Payment VALUES (payment_seq.NEXTVAL,6,1850,'CARD','4242',SYSDATE-5,'PAID');
INSERT INTO Payment VALUES (payment_seq.NEXTVAL,7,1150,'CARD','4242',SYSDATE-6,'PAID');

INSERT INTO Maintenance VALUES (maintenance_seq.NEXTVAL,1,2,SYSDATE-7, 'MECHANICAL','Brake inspection',8000,'COMPLETED');
INSERT INTO Maintenance VALUES (maintenance_seq.NEXTVAL,1,2,SYSDATE-21,'MECHANICAL','Oil change',3500,'COMPLETED');

INSERT INTO Feedback VALUES (feedback_seq.NEXTVAL,4,4,5,SYSDATE-1);
INSERT INTO Feedback VALUES (feedback_seq.NEXTVAL,5,5,4,SYSDATE-2);
INSERT INTO Feedback VALUES (feedback_seq.NEXTVAL,4,5,3,SYSDATE-2);
COMMIT;

/* 5. PL/SQL  (errors use RAISE_APPLICATION_ERROR so the API can show the message) */

-- 5a. create user (+ Driver/Passenger row)
CREATE OR REPLACE PROCEDURE create_user_proc (
   p_name IN VARCHAR2, p_email IN VARCHAR2, p_password IN VARCHAR2,
   p_role IN VARCHAR2, p_user_id OUT NUMBER) IS
BEGIN
   INSERT INTO App_User(user_id,full_name,email,password_hash,role)
   VALUES (user_seq.NEXTVAL,p_name,LOWER(p_email),RAWTOHEX(STANDARD_HASH(p_password,'SHA256')),UPPER(p_role))
   RETURNING user_id INTO p_user_id;
   IF UPPER(p_role)='DRIVER' THEN INSERT INTO Driver(driver_id) VALUES (p_user_id);
   ELSIF UPPER(p_role)='PASSENGER' THEN INSERT INTO Passenger(passenger_id) VALUES (p_user_id);
   END IF;
   COMMIT;
EXCEPTION
   WHEN DUP_VAL_ON_INDEX THEN ROLLBACK; RAISE_APPLICATION_ERROR(-20002,'Email already registered.');
END;
/

-- 5b. admin changes a user's role (adds the Driver/Passenger row if missing)
CREATE OR REPLACE PROCEDURE set_user_role_proc (p_user_id IN NUMBER, p_role IN VARCHAR2) IS
   v_n NUMBER;
BEGIN
   UPDATE App_User SET role=UPPER(p_role) WHERE user_id=p_user_id;
   IF UPPER(p_role)='DRIVER' THEN
      SELECT COUNT(*) INTO v_n FROM Driver WHERE driver_id=p_user_id;
      IF v_n=0 THEN INSERT INTO Driver(driver_id) VALUES (p_user_id); END IF;
   ELSIF UPPER(p_role)='PASSENGER' THEN
      SELECT COUNT(*) INTO v_n FROM Passenger WHERE passenger_id=p_user_id;
      IF v_n=0 THEN INSERT INTO Passenger(passenger_id) VALUES (p_user_id); END IF;
   END IF;
   COMMIT;
END;
/

-- 5c. change password
CREATE OR REPLACE PROCEDURE change_password_proc (
   p_user_id IN NUMBER, p_old IN VARCHAR2, p_new IN VARCHAR2) IS
   v_n NUMBER;
BEGIN
   IF LENGTH(p_new) < 6 THEN RAISE_APPLICATION_ERROR(-20003,'New password needs 6+ characters.'); END IF;
   SELECT COUNT(*) INTO v_n FROM App_User
    WHERE user_id=p_user_id AND password_hash=RAWTOHEX(STANDARD_HASH(p_old,'SHA256'));
   IF v_n=0 THEN RAISE_APPLICATION_ERROR(-20004,'Current password is wrong.'); END IF;
   UPDATE App_User SET password_hash=RAWTOHEX(STANDARD_HASH(p_new,'SHA256')) WHERE user_id=p_user_id;
   COMMIT;
END;
/

-- 5d. create / edit trip (p_trip_id NULL = create). Blocks vehicle/driver double-booking.
CREATE OR REPLACE PROCEDURE save_trip_proc (
   p_trip_id IN OUT NUMBER, p_route_id IN NUMBER, p_vehicle_id IN NUMBER, p_driver_id IN NUMBER,
   p_departure IN TIMESTAMP, p_arrival IN TIMESTAMP) IS
   v_cap NUMBER; v_clash NUMBER; v_booked NUMBER := 0; v_status Trip.status%TYPE;
BEGIN
   IF p_arrival <= p_departure THEN
      RAISE_APPLICATION_ERROR(-20010,'Arrival must be after departure.');
   END IF;
   SELECT capacity INTO v_cap FROM Vehicle WHERE vehicle_id=p_vehicle_id AND status='ACTIVE';

   SELECT COUNT(*) INTO v_clash FROM Trip
    WHERE trip_id <> NVL(p_trip_id,-1) AND status IN ('SCHEDULED','IN_PROGRESS')
      AND (vehicle_id=p_vehicle_id OR driver_id=p_driver_id)
      AND p_departure < arrival_time AND departure_time < p_arrival;
   IF v_clash > 0 THEN
      RAISE_APPLICATION_ERROR(-20011,'Vehicle or driver is already on another trip at that time.');
   END IF;

   IF p_trip_id IS NULL THEN
      INSERT INTO Trip(trip_id,route_id,driver_id,vehicle_id,departure_time,arrival_time,available_seats,status)
      VALUES (trip_seq.NEXTVAL,p_route_id,p_driver_id,p_vehicle_id,p_departure,p_arrival,v_cap,'SCHEDULED')
      RETURNING trip_id INTO p_trip_id;
   ELSE
      SELECT status INTO v_status FROM Trip WHERE trip_id=p_trip_id FOR UPDATE;
      IF v_status <> 'SCHEDULED' THEN
         RAISE_APPLICATION_ERROR(-20012,'Only scheduled trips can be edited.');
      END IF;
      SELECT COUNT(*) INTO v_booked FROM Ticket WHERE trip_id=p_trip_id AND status='BOOKED';
      IF v_booked > v_cap THEN
         RAISE_APPLICATION_ERROR(-20013,'This vehicle is too small for the existing bookings.');
      END IF;
      UPDATE Trip SET route_id=p_route_id, vehicle_id=p_vehicle_id, driver_id=p_driver_id,
             departure_time=p_departure, arrival_time=p_arrival, available_seats=v_cap-v_booked
       WHERE trip_id=p_trip_id;
   END IF;
   COMMIT;
EXCEPTION
   WHEN NO_DATA_FOUND THEN
      ROLLBACK; RAISE_APPLICATION_ERROR(-20014,'Trip or active vehicle not found.');
END;
/

-- 5e. internal helper: cancel one ticket, free the seat, fix payment (no commit)
CREATE OR REPLACE PROCEDURE release_ticket (p_ticket_id IN NUMBER) IS
   v_trip NUMBER;
BEGIN
   UPDATE Ticket SET status='CANCELLED' WHERE ticket_id=p_ticket_id AND status='BOOKED'
   RETURNING trip_id INTO v_trip;
   IF SQL%ROWCOUNT = 0 THEN RETURN; END IF;
   UPDATE Trip SET available_seats = available_seats + 1 WHERE trip_id=v_trip;
   UPDATE Payment SET payment_status = CASE WHEN payment_status='PAID' THEN 'REFUNDED' ELSE 'CANCELLED' END
    WHERE ticket_id=p_ticket_id;
END;
/

-- 5f. cancel a trip + all its tickets
CREATE OR REPLACE PROCEDURE cancel_trip_proc (p_trip_id IN NUMBER) IS
BEGIN
   UPDATE Trip SET status='CANCELLED' WHERE trip_id=p_trip_id AND status='SCHEDULED';
   IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20015,'Only scheduled trips can be cancelled.');
   END IF;
   FOR t IN (SELECT ticket_id FROM Ticket WHERE trip_id=p_trip_id AND status='BOOKED') LOOP
      release_ticket(t.ticket_id);
   END LOOP;
   COMMIT;
END;
/

-- 5g. book a ticket (fare comes from the route, payment row is created here)
CREATE OR REPLACE PROCEDURE book_ticket_proc (
   p_trip_id IN NUMBER, p_passenger_id IN NUMBER, p_seat_no IN NUMBER,
   p_method IN VARCHAR2, p_card4 IN VARCHAR2 DEFAULT NULL, p_ticket_id OUT NUMBER) IS
   v_status Trip.status%TYPE; v_dep Trip.departure_time%TYPE;
   v_seats NUMBER; v_cap NUMBER; v_fare NUMBER;
BEGIN
   SELECT t.status, t.departure_time, t.available_seats, v.capacity, r.base_fare
     INTO v_status, v_dep, v_seats, v_cap, v_fare
     FROM Trip t JOIN Vehicle v ON v.vehicle_id=t.vehicle_id JOIN Route r ON r.route_id=t.route_id
    WHERE t.trip_id=p_trip_id FOR UPDATE OF t.available_seats;

   IF v_status <> 'SCHEDULED' OR v_dep <= SYSTIMESTAMP THEN
      RAISE_APPLICATION_ERROR(-20020,'This trip is no longer open for booking.');
   END IF;
   IF v_seats <= 0 THEN RAISE_APPLICATION_ERROR(-20021,'No seats available on this trip.'); END IF;
   IF p_seat_no < 1 OR p_seat_no > v_cap THEN RAISE_APPLICATION_ERROR(-20022,'Invalid seat number.'); END IF;
   IF UPPER(p_method) NOT IN ('CASH','CARD') THEN RAISE_APPLICATION_ERROR(-20023,'Invalid payment method.'); END IF;

   INSERT INTO Ticket(ticket_id,trip_id,passenger_id,seat_no,fare)
   VALUES (ticket_seq.NEXTVAL,p_trip_id,p_passenger_id,p_seat_no,v_fare)
   RETURNING ticket_id INTO p_ticket_id;

   INSERT INTO Payment(payment_id,ticket_id,amount,payment_method,card_last4,payment_status)
   VALUES (payment_seq.NEXTVAL,p_ticket_id,v_fare,UPPER(p_method),
           CASE WHEN UPPER(p_method)='CARD' THEN p_card4 END,
           CASE WHEN UPPER(p_method)='CARD' THEN 'PAID' ELSE 'PENDING' END);

   UPDATE Trip SET available_seats = available_seats - 1 WHERE trip_id=p_trip_id;
   COMMIT;
EXCEPTION
   WHEN NO_DATA_FOUND THEN ROLLBACK; RAISE_APPLICATION_ERROR(-20024,'Trip not found.');
   WHEN DUP_VAL_ON_INDEX THEN ROLLBACK; RAISE_APPLICATION_ERROR(-20025,'That seat is already booked.');
END;
/

-- 5h. cancel a ticket. p_passenger_id = the passenger (before departure only); NULL = admin
CREATE OR REPLACE PROCEDURE cancel_ticket_proc (p_ticket_id IN NUMBER, p_passenger_id IN NUMBER DEFAULT NULL) IS
   v_pax NUMBER; v_tstatus Trip.status%TYPE; v_dep Trip.departure_time%TYPE; v_status Ticket.status%TYPE;
BEGIN
   SELECT t.passenger_id, t.status, tr.status, tr.departure_time
     INTO v_pax, v_status, v_tstatus, v_dep
     FROM Ticket t JOIN Trip tr ON tr.trip_id=t.trip_id WHERE t.ticket_id=p_ticket_id;
   IF v_status <> 'BOOKED' THEN RAISE_APPLICATION_ERROR(-20030,'Ticket is already cancelled.'); END IF;
   IF p_passenger_id IS NOT NULL THEN
      IF v_pax <> p_passenger_id THEN RAISE_APPLICATION_ERROR(-20031,'This is not your ticket.'); END IF;
      IF v_tstatus <> 'SCHEDULED' OR v_dep <= SYSTIMESTAMP THEN
         RAISE_APPLICATION_ERROR(-20032,'Tickets can only be cancelled before departure.');
      END IF;
   END IF;
   release_ticket(p_ticket_id);
   COMMIT;
EXCEPTION
   WHEN NO_DATA_FOUND THEN RAISE_APPLICATION_ERROR(-20033,'Ticket not found.');
END;
/

-- 5i. driver starts / ends a trip (p_status = 'IN_PROGRESS' or 'COMPLETED')
CREATE OR REPLACE PROCEDURE set_trip_status_proc (p_trip_id IN NUMBER, p_driver_id IN NUMBER, p_status IN VARCHAR2) IS
   v_drv NUMBER; v_cur Trip.status%TYPE; v_busy NUMBER;
BEGIN
   SELECT driver_id, status INTO v_drv, v_cur FROM Trip WHERE trip_id=p_trip_id FOR UPDATE;
   IF v_drv <> p_driver_id THEN RAISE_APPLICATION_ERROR(-20040,'This is not your trip.'); END IF;
   IF p_status = 'IN_PROGRESS' THEN
      IF v_cur <> 'SCHEDULED' THEN RAISE_APPLICATION_ERROR(-20041,'Only a scheduled trip can be started.'); END IF;
      SELECT COUNT(*) INTO v_busy FROM Trip WHERE driver_id=p_driver_id AND status='IN_PROGRESS';
      IF v_busy > 0 THEN RAISE_APPLICATION_ERROR(-20042,'Finish your current trip first.'); END IF;
   ELSIF p_status = 'COMPLETED' THEN
      IF v_cur <> 'IN_PROGRESS' THEN RAISE_APPLICATION_ERROR(-20043,'Only a trip in progress can be ended.'); END IF;
   ELSE
      RAISE_APPLICATION_ERROR(-20044,'Invalid status.');
   END IF;
   UPDATE Trip SET status=p_status WHERE trip_id=p_trip_id;
   COMMIT;
EXCEPTION
   WHEN NO_DATA_FOUND THEN RAISE_APPLICATION_ERROR(-20045,'Trip not found.');
END;
/

-- 5j. payments: admin or driver marks cash PAID; admin refunds. p_driver_id = driver collecting (NULL = admin)
CREATE OR REPLACE PROCEDURE set_payment_proc (p_payment_id IN NUMBER, p_status IN VARCHAR2, p_driver_id IN NUMBER DEFAULT NULL) IS
   v_cur Payment.payment_status%TYPE; v_method Payment.payment_method%TYPE; v_drv NUMBER;
BEGIN
   SELECT p.payment_status, p.payment_method, tr.driver_id INTO v_cur, v_method, v_drv
     FROM Payment p JOIN Ticket t ON t.ticket_id=p.ticket_id JOIN Trip tr ON tr.trip_id=t.trip_id
    WHERE p.payment_id=p_payment_id FOR UPDATE OF p.payment_status;
   IF p_driver_id IS NOT NULL AND v_drv <> p_driver_id THEN
      RAISE_APPLICATION_ERROR(-20050,'This payment is not on your trip.');
   END IF;
   IF p_status='PAID' AND v_cur='PENDING' AND v_method='CASH' THEN NULL;
   ELSIF p_status='REFUNDED' AND v_cur='PAID' AND p_driver_id IS NULL THEN NULL;
   ELSE RAISE_APPLICATION_ERROR(-20051,'That payment change is not allowed.');
   END IF;
   UPDATE Payment SET payment_status=p_status, payment_date=SYSDATE WHERE payment_id=p_payment_id;
   COMMIT;
EXCEPTION
   WHEN NO_DATA_FOUND THEN RAISE_APPLICATION_ERROR(-20052,'Payment not found.');
END;
/

-- 5k. add a rating (completed trips the passenger travelled on). Returns feedback_id for MongoDB.
CREATE OR REPLACE PROCEDURE add_feedback_proc (
   p_passenger_id IN NUMBER, p_trip_id IN NUMBER, p_rating IN NUMBER, p_feedback_id OUT NUMBER) IS
   v_ok NUMBER;
BEGIN
   SELECT COUNT(*) INTO v_ok FROM Ticket t JOIN Trip tr ON tr.trip_id=t.trip_id
    WHERE t.trip_id=p_trip_id AND t.passenger_id=p_passenger_id AND t.status='BOOKED' AND tr.status='COMPLETED';
   IF v_ok = 0 THEN RAISE_APPLICATION_ERROR(-20060,'You can only review completed trips you travelled on.'); END IF;
   INSERT INTO Feedback(feedback_id,passenger_id,trip_id,rating)
   VALUES (feedback_seq.NEXTVAL,p_passenger_id,p_trip_id,p_rating) RETURNING feedback_id INTO p_feedback_id;
   COMMIT;
EXCEPTION
   WHEN DUP_VAL_ON_INDEX THEN ROLLBACK; RAISE_APPLICATION_ERROR(-20061,'You already reviewed this trip.');
END;
/

-- 5l. function: revenue of a trip
CREATE OR REPLACE FUNCTION get_trip_revenue (p_trip_id IN NUMBER) RETURN NUMBER IS
   v_total NUMBER := 0;
BEGIN
   SELECT NVL(SUM(p.amount),0) INTO v_total
     FROM Payment p JOIN Ticket t ON t.ticket_id=p.ticket_id
    WHERE t.trip_id=p_trip_id AND p.payment_status='PAID';
   RETURN v_total;
END;
/

-- 5m. cursor example: passengers on a trip
CREATE OR REPLACE PROCEDURE list_trip_passengers (p_trip_id IN NUMBER) IS
   CURSOR c IS
      SELECT t.seat_no, u.full_name, t.boarded, p.payment_status
        FROM Ticket t JOIN App_User u ON u.user_id=t.passenger_id
        JOIN Payment p ON p.ticket_id=t.ticket_id
       WHERE t.trip_id=p_trip_id AND t.status='BOOKED' ORDER BY t.seat_no;
BEGIN
   FOR r IN c LOOP
      DBMS_OUTPUT.PUT_LINE('Seat '||r.seat_no||': '||r.full_name||' | '||r.payment_status||' | boarded='||r.boarded);
   END LOOP;
END;
/

/* 6. REPORTS used by the Admin "Reports" page.
   Bind :from_date / :to_date (pass 1900-01-01 and 2999-12-31 when no filter is set). */

-- R1 Revenue per route
SELECT r.route_id, r.origin||' -> '||r.destination AS route, SUM(p.amount) AS revenue
  FROM Payment p JOIN Ticket t ON t.ticket_id=p.ticket_id JOIN Trip tr ON tr.trip_id=t.trip_id
  JOIN Route r ON r.route_id=tr.route_id
 WHERE p.payment_status='PAID' AND tr.departure_time BETWEEN :from_date AND :to_date + 1
 GROUP BY r.route_id, r.origin, r.destination ORDER BY revenue DESC;

-- R2 Tickets sold per trip + seats filled %
SELECT tr.trip_id, r.origin||' -> '||r.destination AS route, tr.departure_time,
       COUNT(t.ticket_id) AS tickets_sold, v.capacity,
       ROUND(COUNT(t.ticket_id)/v.capacity*100) AS seats_filled_pct
  FROM Trip tr JOIN Route r ON r.route_id=tr.route_id JOIN Vehicle v ON v.vehicle_id=tr.vehicle_id
  LEFT JOIN Ticket t ON t.trip_id=tr.trip_id AND t.status='BOOKED'
 WHERE tr.status<>'CANCELLED' AND tr.departure_time BETWEEN :from_date AND :to_date + 1
 GROUP BY tr.trip_id, r.origin, r.destination, tr.departure_time, v.capacity
 ORDER BY tr.departure_time DESC;

-- R3 Busiest routes
SELECT r.route_id, r.origin||' -> '||r.destination AS route, COUNT(t.ticket_id) AS tickets
  FROM Route r JOIN Trip tr ON tr.route_id=r.route_id
  JOIN Ticket t ON t.trip_id=tr.trip_id AND t.status='BOOKED'
 WHERE tr.status<>'CANCELLED' AND tr.departure_time BETWEEN :from_date AND :to_date + 1
 GROUP BY r.route_id, r.origin, r.destination ORDER BY tickets DESC;

-- R4 Driver performance (trips + average rating)
SELECT u.user_id, u.full_name, COUNT(DISTINCT tr.trip_id) AS trips, ROUND(AVG(f.rating),1) AS avg_rating
  FROM Driver d JOIN App_User u ON u.user_id=d.driver_id
  LEFT JOIN Trip tr ON tr.driver_id=d.driver_id AND tr.status<>'CANCELLED'
       AND tr.departure_time BETWEEN :from_date AND :to_date + 1
  LEFT JOIN Feedback f ON f.trip_id=tr.trip_id
 WHERE u.status='ACTIVE'
 GROUP BY u.user_id, u.full_name ORDER BY avg_rating DESC NULLS LAST;

-- R5 Payment method breakdown
SELECT p.payment_method, COUNT(*) AS payments, SUM(p.amount) AS amount
  FROM Payment p JOIN Ticket t ON t.ticket_id=p.ticket_id JOIN Trip tr ON tr.trip_id=t.trip_id
 WHERE p.payment_status='PAID' AND tr.departure_time BETWEEN :from_date AND :to_date + 1
 GROUP BY p.payment_method;

-- Extra (from the brief): passenger travel history  (:pid = passenger_id)
SELECT t.ticket_id, r.origin||' -> '||r.destination AS route, tr.departure_time, t.seat_no, t.fare, t.status
  FROM Ticket t JOIN Trip tr ON tr.trip_id=t.trip_id JOIN Route r ON r.route_id=tr.route_id
 WHERE t.passenger_id=:pid ORDER BY tr.departure_time DESC;

-- Extra (from the brief): vehicle maintenance cost summary
SELECT v.vehicle_id, v.reg_number, COUNT(m.maintenance_id) AS service_count, NVL(SUM(m.cost),0) AS total_cost
  FROM Vehicle v LEFT JOIN Maintenance m ON m.vehicle_id=v.vehicle_id
 GROUP BY v.vehicle_id, v.reg_number ORDER BY total_cost DESC;

/* 7. LOGIN QUERY used by the API:
   SELECT u.user_id, u.full_name, u.email, u.role, u.status
     FROM App_User u LEFT JOIN Driver d ON d.driver_id=u.user_id
    WHERE (LOWER(u.username)=:id OR LOWER(u.email)=:id OR LOWER(d.license_no)=:id)
      AND u.password_hash=RAWTOHEX(STANDARD_HASH(:pw,'SHA256'));

   QUICK TEST:
   SET SERVEROUTPUT ON;
   VAR tid NUMBER
   EXEC book_ticket_proc(1, 4, 20, 'CASH', NULL, :tid);
   EXEC list_trip_passengers(1);
   SELECT get_trip_revenue(1) FROM dual;
*/
