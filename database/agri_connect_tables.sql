-- Agri Connect database tables (matches the group ERD)
-- Run by: NPM Scripts > create-tables (only on an empty database)

-- ============================================================
-- Supertype: User  (disjoint "d" specialization by Role)
-- ============================================================
CREATE TABLE IF NOT EXISTS `User` (
    User_id       INT AUTO_INCREMENT PRIMARY KEY,
    F_name        VARCHAR(50)  NOT NULL,
    L_name        VARCHAR(50)  NOT NULL,
    Email         VARCHAR(100) NOT NULL UNIQUE,
    Phone_num     VARCHAR(20),
    Parish        VARCHAR(50),
    Role          ENUM('Farmer','Customer','Admin') NOT NULL,  -- discriminator from the ERD
    Password_hash VARCHAR(255) NOT NULL                       -- not on the ERD; needed for login
);

-- ============================================================
-- Subtypes: Farmer, Customer, Admin  (each linked to one User)
-- ============================================================
CREATE TABLE IF NOT EXISTS Farmer (
    Farmer_id   INT AUTO_INCREMENT PRIMARY KEY,
    User_id     INT NOT NULL UNIQUE,
    Farm_parish VARCHAR(50),
    FOREIGN KEY (User_id) REFERENCES `User`(User_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Customer (
    Customer_id   INT AUTO_INCREMENT PRIMARY KEY,
    User_id       INT NOT NULL UNIQUE,
    Customer_type VARCHAR(30),
    FOREIGN KEY (User_id) REFERENCES `User`(User_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Admin (
    Admin_id     INT AUTO_INCREMENT PRIMARY KEY,
    User_id      INT NOT NULL UNIQUE,
    Access_level VARCHAR(20),
    FOREIGN KEY (User_id) REFERENCES `User`(User_id) ON DELETE CASCADE
);

-- ============================================================
-- RADA_Record  (one-to-one with Farmer)
-- ============================================================
CREATE TABLE IF NOT EXISTS RADA_Record (
    RADA_id      INT AUTO_INCREMENT PRIMARY KEY,
    Farmer_id    INT NOT NULL UNIQUE,
    RADA_reg_num VARCHAR(50) NOT NULL UNIQUE,
    Verif_status ENUM('Pending','Verified','Rejected') DEFAULT 'Pending',
    Verif_date   DATE,
    FOREIGN KEY (Farmer_id) REFERENCES Farmer(Farmer_id) ON DELETE CASCADE
);

-- ============================================================
-- Product  (one Farmer has zero or many Products)
-- ============================================================
CREATE TABLE IF NOT EXISTS Product (
    Product_id INT AUTO_INCREMENT PRIMARY KEY,
    Farmer_id  INT NOT NULL,
    Name       VARCHAR(100)  NOT NULL,
    Category   VARCHAR(50),
    Quantity   INT DEFAULT 0,
    Price      DECIMAL(10,2) NOT NULL,
    Image      VARCHAR(255),          -- file path or URL of the image
    FOREIGN KEY (Farmer_id) REFERENCES Farmer(Farmer_id) ON DELETE CASCADE
);

-- ============================================================
-- Order  (one Customer has many Orders)
-- "Order" is a reserved word in MySQL, so it must be written as `Order`
-- ============================================================
CREATE TABLE IF NOT EXISTS `Order` (
    Order_id    INT AUTO_INCREMENT PRIMARY KEY,
    Customer_id INT NOT NULL,
    Order_date  DATETIME DEFAULT CURRENT_TIMESTAMP,
    Status      ENUM('Pending','Confirmed','Shipped','Delivered','Cancelled') DEFAULT 'Pending',
    FOREIGN KEY (Customer_id) REFERENCES Customer(Customer_id)
);

-- ============================================================
-- Order_Item  (links Order and Product)
-- ============================================================
CREATE TABLE IF NOT EXISTS Order_Item (
    Order_item_id INT AUTO_INCREMENT PRIMARY KEY,
    Order_id      INT NOT NULL,
    Product_id    INT NOT NULL,
    Quantity      INT NOT NULL,
    Order_price   DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (Order_id)   REFERENCES `Order`(Order_id) ON DELETE CASCADE,
    FOREIGN KEY (Product_id) REFERENCES Product(Product_id)
);

-- ============================================================
-- Payment  (one-to-one with Order)
-- ============================================================
CREATE TABLE IF NOT EXISTS Payment (
    Payment_id      INT AUTO_INCREMENT PRIMARY KEY,
    Order_id        INT NOT NULL UNIQUE,
    Amount          DECIMAL(10,2) NOT NULL,
    Stripe_trans_id VARCHAR(255) UNIQUE,
    Payment_status  ENUM('Pending','Completed','Failed','Refunded') DEFAULT 'Pending',
    FOREIGN KEY (Order_id) REFERENCES `Order`(Order_id) ON DELETE CASCADE
);

-- ============================================================
-- Reports  (one Admin generates zero or many Reports)
-- ============================================================
CREATE TABLE IF NOT EXISTS Reports (
    Report_id      INT AUTO_INCREMENT PRIMARY KEY,
    Admin_id       INT,
    Report_type    VARCHAR(50) NOT NULL,
    Date_from      DATE,
    Date_to        DATE,
    Generated_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Admin_id) REFERENCES Admin(Admin_id) ON DELETE SET NULL
);

-- ============================================================
-- Sample data for testing
-- ============================================================
INSERT INTO `User` (F_name, L_name, Email, Phone_num, Parish, Role, Password_hash) VALUES
('John',  'Brown', 'john@example.com',  '876-555-0101', 'Manchester',    'Farmer',   'test'),
('Jane',  'Smith', 'jane@example.com',  '876-555-0102', 'St. Elizabeth', 'Customer', 'test'),
('Admin', 'User',  'admin@example.com', '876-555-0103', 'Kingston',      'Admin',    'test');

INSERT INTO Farmer   (User_id, Farm_parish)   VALUES (1, 'Manchester');
INSERT INTO Customer (User_id, Customer_type) VALUES (2, 'Individual');
INSERT INTO Admin    (User_id, Access_level)  VALUES (3, 'Full');

INSERT INTO RADA_Record (Farmer_id, RADA_reg_num, Verif_status, Verif_date)
VALUES (1, 'RADA-0001', 'Verified', '2026-11-01');
