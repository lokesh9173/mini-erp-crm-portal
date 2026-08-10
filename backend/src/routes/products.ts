import { Router } from 'express';
import { pool } from '../config/db';
import { authenticateToken, authorizeRoles, AuthenticatedRequest } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';
import { z } from 'zod';

const router = Router();

const productSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Product name is required'),
    sku: z.string().min(1, 'SKU is required'),
    category: z.string().min(1, 'Category is required'),
    unit_price: z.number().nonnegative('Unit price must be positive'),
    current_stock: z.number().int().nonnegative('Stock must be positive integer').optional().default(0),
    min_stock_alert: z.number().int().nonnegative('Alert stock must be positive integer').optional().default(5),
    location: z.string().min(1, 'Warehouse location is required'),
  }),
});

const stockAdjustmentSchema = z.object({
  body: z.object({
    quantity: z.number().int().positive('Quantity must be a positive integer'),
    movement_type: z.enum(['IN', 'OUT']),
    reason: z.string().min(1, 'Reason for adjustment is required'),
  }),
});

// GET /api/products
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const category = req.query.category || '%';
    
    // Low stock filter
    const lowStockOnly = req.query.lowStock === 'true';

    let query = `
      SELECT * FROM products
      WHERE (name ILIKE $1 OR sku ILIKE $1 OR location ILIKE $1)
        AND category ILIKE $2
    `;

    if (lowStockOnly) {
      query += ` AND current_stock <= min_stock_alert`;
    }

    query += ` ORDER BY name ASC`;

    const result = await pool.query(query, [search, category]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const query = 'SELECT * FROM products WHERE id = $1';
    const result = await pool.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/products
router.post('/', authenticateToken, authorizeRoles('Admin', 'Warehouse'), validateRequest(productSchema), async (req: AuthenticatedRequest, res, next) => {
  const { name, sku, category, unit_price, current_stock, min_stock_alert, location } = req.body;
  const userId = req.user?.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check unique SKU
    const checkSku = await client.query('SELECT id FROM products WHERE sku = $1', [sku.toUpperCase().trim()]);
    if (checkSku.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'A product with this SKU already exists' });
    }

    const insertQuery = `
      INSERT INTO products (name, sku, category, unit_price, current_stock, min_stock_alert, location)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const result = await client.query(insertQuery, [
      name.trim(),
      sku.toUpperCase().trim(),
      category.trim(),
      unit_price,
      current_stock,
      min_stock_alert,
      location.trim(),
    ]);

    const product = result.rows[0];

    // Log initial stock movement if it's > 0
    if (current_stock > 0) {
      await client.query(
        `INSERT INTO stock_movement_logs (product_id, quantity, movement_type, reason, created_by)
         VALUES ($1, $2, 'IN', 'Initial stock setup', $3)`,
        [product.id, current_stock, userId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PUT /api/products/:id
router.put('/:id', authenticateToken, authorizeRoles('Admin', 'Warehouse'), validateRequest(productSchema), async (req, res, next) => {
  const { name, sku, category, unit_price, min_stock_alert, location } = req.body;
  const productId = req.params.id;

  try {
    // Check SKU conflicts with other products
    const skuCheck = await pool.query('SELECT id FROM products WHERE sku = $1 AND id <> $2', [sku.toUpperCase().trim(), productId]);
    if (skuCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'SKU code is already used by another product' });
    }

    const updateQuery = `
      UPDATE products
      SET name = $1, sku = $2, category = $3, unit_price = $4, min_stock_alert = $5, location = $6
      WHERE id = $7
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [
      name.trim(),
      sku.toUpperCase().trim(),
      category.trim(),
      unit_price,
      min_stock_alert,
      location.trim(),
      productId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/products/:id/adjust-stock
router.post('/:id/adjust-stock', authenticateToken, authorizeRoles('Admin', 'Warehouse'), validateRequest(stockAdjustmentSchema), async (req: AuthenticatedRequest, res, next) => {
  const productId = req.params.id;
  const { quantity, movement_type, reason } = req.body;
  const userId = req.user?.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Select row for update to lock it
    const selectQuery = 'SELECT current_stock, name FROM products WHERE id = $1 FOR UPDATE';
    const selectResult = await client.query(selectQuery, [productId]);

    if (selectResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const currentStock = selectResult.rows[0].current_stock;
    let newStock = currentStock;

    if (movement_type === 'IN') {
      newStock = currentStock + quantity;
    } else if (movement_type === 'OUT') {
      newStock = currentStock - quantity;
      if (newStock < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Insufficient stock. Current stock is ${currentStock}, requested reduction is ${quantity}.`,
        });
      }
    }

    // Update stock
    const updateResult = await client.query(
      'UPDATE products SET current_stock = $1 WHERE id = $2 RETURNING *',
      [newStock, productId]
    );

    // Write movement log
    await client.query(
      `INSERT INTO stock_movement_logs (product_id, quantity, movement_type, reason, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [productId, quantity, movement_type, reason.trim(), userId]
    );

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Stock adjusted successfully',
      data: updateResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// GET /api/products/:id/movements
router.get('/:id/movements', authenticateToken, async (req, res, next) => {
  const productId = req.params.id;
  try {
    const query = `
      SELECT m.*, u.username as created_by_user
      FROM stock_movement_logs m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.product_id = $1
      ORDER BY m.created_at DESC
    `;
    const result = await pool.query(query, [productId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
