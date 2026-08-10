import { Router } from 'express';
import { pool } from '../config/db';
import { authenticateToken, authorizeRoles, AuthenticatedRequest } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';
import { z } from 'zod';

const router = Router();

const customerSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    mobile: z.string().min(10, 'Mobile must be at least 10 characters'),
    email: z.string().email('Invalid email address'),
    business_name: z.string().min(1, 'Business name is required'),
    gst_number: z.string().max(15).optional().nullable(),
    type: z.enum(['Retail', 'Wholesale', 'Distributor']),
    address: z.string().min(1, 'Address is required'),
    status: z.enum(['Lead', 'Active', 'Inactive']).default('Lead'),
    follow_up_date: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }),
});

const noteSchema = z.object({
  body: z.object({
    note: z.string().min(1, 'Note content cannot be empty'),
  }),
});

// GET /api/customers
router.get('/', authenticateToken, authorizeRoles('Admin', 'Sales', 'Accounts'), async (req, res, next) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const status = req.query.status || '%';
    const type = req.query.type || '%';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const query = `
      SELECT * FROM customers
      WHERE (name ILIKE $1 OR business_name ILIKE $1 OR email ILIKE $1 OR mobile ILIKE $1)
        AND status::text ILIKE $2
        AND type::text ILIKE $3
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5
    `;

    const countQuery = `
      SELECT COUNT(*) FROM customers
      WHERE (name ILIKE $1 OR business_name ILIKE $1 OR email ILIKE $1 OR mobile ILIKE $1)
        AND status::text ILIKE $2
        AND type::text ILIKE $3
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, [search, status, type, limit, offset]),
      pool.query(countQuery, [search, status, type]),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/:id
router.get('/:id', authenticateToken, authorizeRoles('Admin', 'Sales', 'Accounts'), async (req, res, next) => {
  try {
    const query = 'SELECT * FROM customers WHERE id = $1';
    const result = await pool.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers
router.post('/', authenticateToken, authorizeRoles('Admin', 'Sales'), validateRequest(customerSchema), async (req, res, next) => {
  const { name, mobile, email, business_name, gst_number, type, address, status, follow_up_date, notes } = req.body;
  try {
    const query = `
      INSERT INTO customers (name, mobile, email, business_name, gst_number, type, address, status, follow_up_date, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const result = await pool.query(query, [
      name.trim(),
      mobile.trim(),
      email.toLowerCase().trim(),
      business_name.trim(),
      gst_number ? gst_number.toUpperCase().trim() : null,
      type,
      address.trim(),
      status,
      follow_up_date || null,
      notes || null,
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticateToken, authorizeRoles('Admin', 'Sales'), validateRequest(customerSchema), async (req, res, next) => {
  const { name, mobile, email, business_name, gst_number, type, address, status, follow_up_date, notes } = req.body;
  try {
    const query = `
      UPDATE customers
      SET name = $1, mobile = $2, email = $3, business_name = $4, gst_number = $5, type = $6, address = $7, status = $8, follow_up_date = $9, notes = $10
      WHERE id = $11
      RETURNING *
    `;
    const result = await pool.query(query, [
      name.trim(),
      mobile.trim(),
      email.toLowerCase().trim(),
      business_name.trim(),
      gst_number ? gst_number.toUpperCase().trim() : null,
      type,
      address.trim(),
      status,
      follow_up_date || null,
      notes || null,
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers/:id/notes
router.post('/:id/notes', authenticateToken, authorizeRoles('Admin', 'Sales'), validateRequest(noteSchema), async (req: AuthenticatedRequest, res, next) => {
  const { note } = req.body;
  const customerId = req.params.id;
  const userId = req.user?.id;

  try {
    // Check if customer exists
    const checkCust = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId]);
    if (checkCust.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const query = `
      INSERT INTO crm_notes (customer_id, note, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [customerId, note.trim(), userId]);

    // Also update customer's last notes summary (optional but helpful)
    await pool.query('UPDATE customers SET notes = $1 WHERE id = $2', [note.trim(), customerId]);

    // Return populated note details
    const populated = await pool.query(`
      SELECT n.*, u.username as author
      FROM crm_notes n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.id = $1
    `, [result.rows[0].id]);

    res.status(201).json({ success: true, data: populated.rows[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/:id/notes
router.get('/:id/notes', authenticateToken, authorizeRoles('Admin', 'Sales', 'Accounts'), async (req, res, next) => {
  const customerId = req.params.id;
  try {
    const query = `
      SELECT n.*, u.username as author
      FROM crm_notes n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.customer_id = $1
      ORDER BY n.created_at DESC
    `;
    const result = await pool.query(query, [customerId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
