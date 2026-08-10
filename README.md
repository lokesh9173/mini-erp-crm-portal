# Mini ERP + CRM Operations Portal

A complete, production-ready, full-stack Mini ERP & CRM operations portal built for wholesale/distribution companies. It features role-based access control, customer management, inventory catalog tracking with automated alerts, and transactional sales challan flows.

---

## 🚀 Tech Stack
- **Backend**: Node.js, TypeScript, Express.js
- **Database**: PostgreSQL (with transactional isolation locks)
- **Frontend**: React (Vite, TypeScript, Vanilla CSS for glassmorphism/dark-mode styling)
- **APIs**: RESTful with stateless JWT authentication & Zod validations
- **Audit Logging**: Automated stock movement log entries
- **Extras**: Invoice PDF generation, Docker setup, Postman collection

---

## 📁 Folder Structure
- `backend/`: Node.js Express server, schema migrations, seed inputs, controllers, validation middlewares, routes, and pdf services.
- `frontend/`: React Vite client SPA, auth contexts, sidebar modules, styling templates, and billing invoice print grids.
- `Postman_Collection.json`: API collections for endpoint verification.
- `docker-compose.yml` / `Dockerfile`: Docker orchestration.

---

## 🔑 Demo Login Credentials
Use the pre-seeded users below to access different role modules. Pre-configured buttons are available on the login screen for instant autofill:

| Username | Password | Role | Permissions Profile |
| :--- | :--- | :--- | :--- |
| **admin** | `admin123` | **Admin** | Full system read/write access (User/Catalog edits, CRM adjustments, Challan confirmations). |
| **sales** | `sales123` | **Sales** | Lead CRM entries, CRM Notes, create & edit Challan Drafts, confirm challan allocations. |
| **warehouse** | `warehouse123` | **Warehouse** | Catalog management, raw inventory stock adjust (IN/OUT), confirm/cancel active challans. |
| **accounts** | `accounts123` | **Accounts** | Read-only view for all customers, products catalog, and challan invoices. |

---

## 🛠️ Getting Started (Local Setup)

### Prerequisites
- Node.js (v18+)
- PostgreSQL (or use the custom sandbox DB steps below)

### Step 1: Initialize Database Server Sandbox
If you do not have a PostgreSQL database server running locally, or do not know the credentials, you can spin up a dedicated sandbox database cluster in the project directory using:

```bash
# 1. Initialize data cluster
/Library/PostgreSQL/18/bin/initdb -D ./db_data -U postgres --auth=trust

# 2. Start the database server on port 5433
/Library/PostgreSQL/18/bin/pg_ctl -D ./db_data -o "-p 5433" -l ./db_data/server.log start

# 3. Create the database
/Library/PostgreSQL/18/bin/createdb -h localhost -p 5433 -U postgres mini_erp
```

### Step 2: Configure & Seed Backend API
1. Navigate to the backend directory and configure the environment variables:
   ```bash
   cd backend
   # Ensure .env matches connection settings:
   # PORT=5050
   # DATABASE_URL=postgresql://postgres@localhost:5433/mini_erp
   # JWT_SECRET=supersecretkeyformini_erp_crm_system_2026
   ```
2. Run database migration schema and seeds:
   ```bash
   npm run schema   # Generates tables, drops old relations
   npm run seed     # Seeds users, initial products, and customers
   ```
3. Start the API server in development mode:
   ```bash
   npm run dev      # Runs dev watch server on http://localhost:5050
   ```

### Step 3: Run Frontend UI
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   npm run dev      # Launches browser server on http://localhost:5173
   ```
2. Open [http://localhost:5173/](http://localhost:5173/) in your web browser.

---

## 🐳 Docker Deployment (Compose)
To build and run the entire ecosystem (Postgres Database, Backend API, and Nginx Frontend SPA) inside isolated containers:

```bash
# In the root project directory
docker-compose up --build
```
- **Frontend SPA**: accessible on `http://localhost/`
- **Backend API**: accessible on `http://localhost:5050/api`
- **Postgres Database**: accessible on `localhost:5432`

---

## 🧪 REST API Reference Summary

### 🔒 Authentication
- `POST /api/auth/login` - Authenticate username and password. Returns JWT token.
- `GET /api/auth/me` - Fetch authenticated user details.

### 👥 CRM Customers
- `GET /api/customers` - Fetch list of customers (supports search query, status/type filters, pagination).
- `POST /api/customers` - Log a new customer.
- `GET /api/customers/:id` - View detailed contact card.
- `PUT /api/customers/:id` - Edit customer metadata.
- `GET /api/customers/:id/notes` - Retrieve discussion logs.
- `POST /api/customers/:id/notes` - Log a follow-up discussion note.

### 📦 Products & Stock
- `GET /api/products` - View product catalog (supports search, categories, and low-stock triggers).
- `POST /api/products` - Create catalog item.
- `PUT /api/products/:id` - Edit item specifications.
- `POST /api/products/:id/adjust-stock` - Manually adjust stock levels (IN/OUT) with logging reasons.
- `GET /api/products/:id/movements` - Audit ledger of stock movements.

### 📄 Sales Challan
- `GET /api/challans` - List all challans.
- `GET /api/challans/:id` - View invoice specs with customer/product snap details.
- `POST /api/challans` - Draft a new challan.
- `PUT /api/challans/:id` - Edit draft challans.
- `PATCH /api/challans/:id/status` - Transition status (`Confirmed` / `Cancelled`). Triggers locks and updates stock.
- `GET /api/challans/:id/pdf` - Export printed Invoice copy in PDF.
