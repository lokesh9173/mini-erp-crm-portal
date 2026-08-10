import request from 'supertest';
import app from '../app';
import { pool } from '../config/db';

describe('Mini ERP + CRM API Integration Tests', () => {
  let adminToken: string;
  let salesToken: string;
  let warehouseToken: string;
  let accountsToken: string;

  let testCustomerId: string;
  let testProductId: string;
  let testChallanId: string;

  beforeAll(async () => {
    // Authenticate all test roles
    const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const salesRes = await request(app).post('/api/auth/login').send({ username: 'sales', password: 'sales123' });
    salesToken = salesRes.body.token;

    const warehouseRes = await request(app).post('/api/auth/login').send({ username: 'warehouse', password: 'warehouse123' });
    warehouseToken = warehouseRes.body.token;

    const accountsRes = await request(app).post('/api/auth/login').send({ username: 'accounts', password: 'accounts123' });
    accountsToken = accountsRes.body.token;

    // Get seeded test customer and product IDs
    const custRes = await pool.query("SELECT id FROM customers LIMIT 1");
    testCustomerId = custRes.rows[0].id;

    const prodRes = await pool.query("SELECT id FROM products WHERE sku = 'STL-2MM-001'");
    testProductId = prodRes.rows[0].id;
  });

  afterAll(async () => {
    // Close db pool connection to clean up Jest thread
    await pool.end();
  });

  describe('1. Role-Based Access Control (RBAC) validations', () => {
    it('Admin can view customer CRM files', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Warehouse user cannot view customer CRM files (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${warehouseToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Sales user cannot adjust raw product stock levels (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/products/${testProductId}/adjust-stock`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ quantity: 10, movement_type: 'IN', reason: 'Attempt unauthorized adjustment' });
      expect(res.status).toBe(403);
    });

    it('Warehouse user can adjust raw product stock levels', async () => {
      const res = await request(app)
        .post(`/api/products/${testProductId}/adjust-stock`)
        .set('Authorization', `Bearer ${warehouseToken}`)
        .send({ quantity: 1, movement_type: 'IN', reason: 'Test validation adjustment' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Sales Challan critical transaction checks', () => {
    it('Creating a Draft challan does not deduct stock levels', async () => {
      // Fetch initial stock
      const initialStockRes = await pool.query("SELECT current_stock FROM products WHERE id = $1", [testProductId]);
      const initialStock = parseInt(initialStockRes.rows[0].current_stock);

      const challanDraft = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customer_id: testCustomerId,
          status: 'Draft',
          items: [{ product_id: testProductId, quantity: 5 }]
        });
      
      expect(challanDraft.status).toBe(201);
      testChallanId = challanDraft.body.data.id;

      // Verify stock did not drop
      const finalStockRes = await pool.query("SELECT current_stock FROM products WHERE id = $1", [testProductId]);
      const finalStock = parseInt(finalStockRes.rows[0].current_stock);
      expect(finalStock).toBe(initialStock);
    });

    it('Confirming a challan deducts stock level and logs OUT movement', async () => {
      const initialStockRes = await pool.query("SELECT current_stock FROM products WHERE id = $1", [testProductId]);
      const initialStock = parseInt(initialStockRes.rows[0].current_stock);

      const confirmRes = await request(app)
        .patch(`/api/challans/${testChallanId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'Confirmed' });

      expect(confirmRes.status).toBe(200);

      // Verify stock decreased by 5
      const finalStockRes = await pool.query("SELECT current_stock FROM products WHERE id = $1", [testProductId]);
      const finalStock = parseInt(finalStockRes.rows[0].current_stock);
      expect(finalStock).toBe(initialStock - 5);

      // Verify movement log exists
      const logRes = await pool.query("SELECT * FROM stock_movement_logs WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1", [testProductId]);
      expect(logRes.rows[0].movement_type).toBe('OUT');
      expect(logRes.rows[0].quantity).toBe(5);
    });

    it('Cannot confirm an already confirmed challan (duplicate check)', async () => {
      const confirmRes = await request(app)
        .patch(`/api/challans/${testChallanId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'Confirmed' });
      
      expect(confirmRes.status).toBe(400);
      expect(confirmRes.body.success).toBe(false);
    });

    it('Cancelling a confirmed challan returns stock and logs IN movement', async () => {
      const initialStockRes = await pool.query("SELECT current_stock FROM products WHERE id = $1", [testProductId]);
      const initialStock = parseInt(initialStockRes.rows[0].current_stock);

      const cancelRes = await request(app)
        .patch(`/api/challans/${testChallanId}/status`)
        .set('Authorization', `Bearer ${warehouseToken}`)
        .send({ status: 'Cancelled' });

      expect(cancelRes.status).toBe(200);

      // Verify stock returned by 5
      const finalStockRes = await pool.query("SELECT current_stock FROM products WHERE id = $1", [testProductId]);
      const finalStock = parseInt(finalStockRes.rows[0].current_stock);
      expect(finalStock).toBe(initialStock + 5);

      // Verify movement log IN
      const logRes = await pool.query("SELECT * FROM stock_movement_logs WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1", [testProductId]);
      expect(logRes.rows[0].movement_type).toBe('IN');
    });

    it('Over-allocation: returns 400 Bad Request error if stock is insufficient', async () => {
      // Try to purchase an excessive quantity of Plastic Pallets (seeded with only 3 units)
      const palletRes = await pool.query("SELECT id, current_stock FROM products WHERE sku = 'PLT-PL-004'");
      const palletId = palletRes.rows[0].id;
      const palletStock = parseInt(palletRes.rows[0].current_stock); // e.g. 3

      // Create a draft with 5 pallets (insufficient)
      const challanDraft = await request(app)
        .post('/api/challans')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customer_id: testCustomerId,
          status: 'Draft',
          items: [{ product_id: palletId, quantity: palletStock + 2 }]
        });
      
      const newChallanId = challanDraft.body.data.id;

      // Attempt to confirm
      const confirmRes = await request(app)
        .patch(`/api/challans/${newChallanId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'Confirmed' });

      expect(confirmRes.status).toBe(400);
      expect(confirmRes.body.success).toBe(false);
      expect(confirmRes.body.message).toContain('Insufficient stock');
    });
  });
});
