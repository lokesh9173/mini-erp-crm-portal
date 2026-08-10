import { pool } from '../config/db';
import bcrypt from 'bcryptjs';

async function seedDatabase() {
  console.log('Starting data seeding...');
  try {
    const adminHash = await bcrypt.hash('admin123', 10);
    const salesHash = await bcrypt.hash('sales123', 10);
    const warehouseHash = await bcrypt.hash('warehouse123', 10);
    const accountsHash = await bcrypt.hash('accounts123', 10);

    // Insert Users
    const userQuery = `
      INSERT INTO users (username, email, password_hash, role) VALUES
      ('admin', 'admin@erp.com', $1, 'Admin'),
      ('sales', 'sales@erp.com', $2, 'Sales'),
      ('warehouse', 'warehouse@erp.com', $3, 'Warehouse'),
      ('accounts', 'accounts@erp.com', $4, 'Accounts')
      ON CONFLICT (username) DO NOTHING
      RETURNING id, username, role;
    `;
    const userResult = await pool.query(userQuery, [adminHash, salesHash, warehouseHash, accountsHash]);
    console.log('Users seeded:', userResult.rows);

    // Insert Customers
    const customerQuery = `
      INSERT INTO customers (name, mobile, email, business_name, gst_number, type, address, status, follow_up_date, notes) VALUES
      ('Aarav Mehta', '9876543210', 'aarav.mehta@acme.com', 'Acme Enterprises', '27AAAAA1111A1Z1', 'Wholesale', '101, Business Park, Mumbai, MH', 'Active', '2026-08-15', 'Regular buyer of steel sheets.'),
      ('Neha Sharma', '9812345678', 'neha@retailhub.com', 'Retail Hub Inc', '27BBBBB2222B2Z2', 'Retail', '402, Sector 15, Navi Mumbai, MH', 'Lead', '2026-08-12', 'Interested in plastic items.'),
      ('Vikram Singh', '9900887766', 'vikram@distributors.com', 'Singh Distributors', '27CCCCC3333C3Z3', 'Distributor', 'G-12, MIDC Industrial Area, Pune, MH', 'Active', '2026-09-01', 'Primary distributor for western region.')
      RETURNING id, name;
    `;
    const customerResult = await pool.query(customerQuery);
    console.log('Customers seeded:', customerResult.rows);

    const aaravId = customerResult.rows[0].id;
    const adminIdQuery = await pool.query("SELECT id FROM users WHERE username = 'admin'");
    const adminId = adminIdQuery.rows[0].id;

    // Seed some crm notes
    const noteQuery = `
      INSERT INTO crm_notes (customer_id, note, created_by) VALUES
      ($1, 'Initial call. Customer wants steel catalog.', $2),
      ($1, 'Follow-up call. Customer accepted wholesale terms.', $2)
    `;
    await pool.query(noteQuery, [aaravId, adminId]);

    // Insert Products
    const productQuery = `
      INSERT INTO products (name, sku, category, unit_price, current_stock, min_stock_alert, location) VALUES
      ('Steel Sheet 2mm', 'STL-2MM-001', 'Raw Materials', 450.00, 100, 10, 'Warehouse A - Section 1'),
      ('Steel Sheet 5mm', 'STL-5MM-002', 'Raw Materials', 750.00, 45, 5, 'Warehouse A - Section 2'),
      ('Copper Wire 10m', 'COP-W10-003', 'Electrical', 120.00, 150, 20, 'Warehouse B - Bin 4'),
      ('Plastic Pallets', 'PLT-PL-004', 'Packaging', 350.00, 3, 5, 'Warehouse C - Zone D'),
      ('Industrial Screws Box', 'SCR-IND-005', 'Fasteners', 95.00, 8, 10, 'Warehouse B - Shelf 2')
      RETURNING id, name, current_stock;
    `;
    const productResult = await pool.query(productQuery);
    console.log('Products seeded:', productResult.rows);

    // Seed stock movement logs for initial stocks
    for (const prod of productResult.rows) {
      await pool.query(
        `INSERT INTO stock_movement_logs (product_id, quantity, movement_type, reason, created_by)
         VALUES ($1, $2, 'IN', 'Initial Stock Upload', $3)`,
        [prod.id, prod.current_stock, adminId]
      );
    }
    console.log('Initial stock movement logs created.');

    console.log('Data seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await pool.end();
  }
}

seedDatabase();
