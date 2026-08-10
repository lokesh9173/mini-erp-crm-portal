import { Router } from 'express';
import { pool } from '../config/db';
import { authenticateToken, authorizeRoles, AuthenticatedRequest } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validate';
import { z } from 'zod';
import PDFDocument from 'pdfkit';

const router = Router();

const challanItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive('Quantity must be positive'),
});

const createChallanSchema = z.object({
  body: z.object({
    customer_id: z.string().uuid(),
    items: z.array(challanItemSchema).min(1, 'Challan must contain at least one item'),
    status: z.enum(['Draft', 'Confirmed']).default('Draft'),
  }),
});

const patchStatusSchema = z.object({
  body: z.object({
    status: z.enum(['Confirmed', 'Cancelled']),
  }),
});

// Helper: Generate Unique Challan Number in transaction
async function generateChallanNumber(client: any): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  
  // Count challans created today
  const result = await client.query(
    `SELECT COUNT(*) FROM sales_challans WHERE challan_number LIKE $1`,
    [`CH-${dateStr}-%`]
  );
  
  const count = parseInt(result.rows[0].count) + 1;
  const seq = String(count).padStart(4, '0');
  return `CH-${dateStr}-${seq}`;
}

// GET /api/challans
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const status = req.query.status || '%';
    const customerId = req.query.customerId || '%';

    const query = `
      SELECT c.*, cust.name as customer_name, cust.business_name as customer_business, u.username as creator_name
      FROM sales_challans c
      LEFT JOIN customers cust ON c.customer_id = cust.id
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.status::text LIKE $1 AND c.customer_id::text LIKE $2
      ORDER BY c.created_at DESC
    `;
    const result = await pool.query(query, [status, customerId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/challans/:id
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const challanQuery = `
      SELECT c.*, cust.name as customer_name, cust.business_name as customer_business, u.username as creator_name
      FROM sales_challans c
      LEFT JOIN customers cust ON c.customer_id = cust.id
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = $1
    `;
    const challanResult = await pool.query(challanQuery, [req.params.id]);

    if (challanResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    const itemsQuery = `
      SELECT ci.*, p.name as current_product_name, p.sku as current_product_sku
      FROM sales_challan_items ci
      LEFT JOIN products p ON ci.product_id = p.id
      WHERE ci.challan_id = $1
    `;
    const itemsResult = await pool.query(itemsQuery, [req.params.id]);

    res.json({
      success: true,
      data: {
        ...challanResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/challans
router.post('/', authenticateToken, authorizeRoles('Admin', 'Sales'), validateRequest(createChallanSchema), async (req: AuthenticatedRequest, res, next) => {
  const { customer_id, items, status } = req.body;
  const userId = req.user?.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch customer details for snapshot
    const customerRes = await client.query('SELECT * FROM customers WHERE id = $1', [customer_id]);
    if (customerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const customer = customerRes.rows[0];
    const customerSnapshot = {
      name: customer.name,
      mobile: customer.mobile,
      email: customer.email,
      business_name: customer.business_name,
      gst_number: customer.gst_number,
      address: customer.address,
    };

    // Verify all products exist and capture snapshot data
    const productSnapshots: any[] = [];
    let totalQuantity = 0;

    for (const item of items) {
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (prodRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: `Product ID ${item.product_id} not found` });
      }
      const product = prodRes.rows[0];
      
      productSnapshots.push({
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit_price: product.unit_price,
        quantity: item.quantity,
        current_stock: product.current_stock,
      });

      totalQuantity += item.quantity;
    }

    // Generate Challan Number
    const challanNumber = await generateChallanNumber(client);

    // If status is 'Confirmed', lock stock and verify capacity
    if (status === 'Confirmed') {
      for (const item of productSnapshots) {
        const lockRes = await client.query('SELECT current_stock FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
        const stock = lockRes.rows[0].current_stock;
        if (stock < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for product ${item.name} (${item.sku}). Stock: ${stock}, Requested: ${item.quantity}`,
          });
        }
      }

      // Deduct stock and log movements
      for (const item of productSnapshots) {
        await client.query('UPDATE products SET current_stock = current_stock - $1 WHERE id = $2', [item.quantity, item.product_id]);
        await client.query(
          `INSERT INTO stock_movement_logs (product_id, quantity, movement_type, reason, created_by)
           VALUES ($1, $2, 'OUT', $3, $4)`,
          [item.product_id, item.quantity, `Sales Challan ${challanNumber} Confirmed`, userId]
        );
      }
    }

    // Insert Challan Header
    const challanInsert = `
      INSERT INTO sales_challans (challan_number, customer_id, customer_snapshot, total_quantity, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const challanRes = await client.query(challanInsert, [
      challanNumber,
      customer_id,
      JSON.stringify(customerSnapshot),
      totalQuantity,
      status,
      userId,
    ]);
    const newChallan = challanRes.rows[0];

    // Insert Challan Items
    for (const item of productSnapshots) {
      await client.query(
        `INSERT INTO sales_challan_items (challan_id, product_id, product_sku_snapshot, product_name_snapshot, unit_price_snapshot, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newChallan.id, item.product_id, item.sku, item.name, item.unit_price, item.quantity]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      data: {
        ...newChallan,
        items: productSnapshots,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PUT /api/challans/:id
router.put('/:id', authenticateToken, authorizeRoles('Admin', 'Sales'), validateRequest(createChallanSchema), async (req: AuthenticatedRequest, res, next) => {
  const { customer_id, items, status } = req.body;
  const challanId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch existing challan
    const challanRes = await client.query('SELECT status, challan_number FROM sales_challans WHERE id = $1 FOR UPDATE', [challanId]);
    if (challanRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    const existingChallan = challanRes.rows[0];
    if (existingChallan.status !== 'Draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Only Draft challans can be edited' });
    }

    // Capture Customer Snapshot
    const customerRes = await client.query('SELECT * FROM customers WHERE id = $1', [customer_id]);
    if (customerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const customer = customerRes.rows[0];
    const customerSnapshot = {
      name: customer.name,
      mobile: customer.mobile,
      email: customer.email,
      business_name: customer.business_name,
      gst_number: customer.gst_number,
      address: customer.address,
    };

    // Capture Product Snapshot details
    const productSnapshots: any[] = [];
    let totalQuantity = 0;

    for (const item of items) {
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (prodRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: `Product ID ${item.product_id} not found` });
      }
      const product = prodRes.rows[0];
      productSnapshots.push({
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit_price: product.unit_price,
        quantity: item.quantity,
      });
      totalQuantity += item.quantity;
    }

    // Delete existing items
    await client.query('DELETE FROM sales_challan_items WHERE challan_id = $1', [challanId]);

    // Insert new items
    for (const item of productSnapshots) {
      await client.query(
        `INSERT INTO sales_challan_items (challan_id, product_id, product_sku_snapshot, product_name_snapshot, unit_price_snapshot, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [challanId, item.product_id, item.sku, item.name, item.unit_price, item.quantity]
      );
    }

    // Update challan header details
    const updateHeader = `
      UPDATE sales_challans
      SET customer_id = $1, customer_snapshot = $2, total_quantity = $3, status = $4
      WHERE id = $5
      RETURNING *
    `;
    const updatedChallanRes = await client.query(updateHeader, [
      customer_id,
      JSON.stringify(customerSnapshot),
      totalQuantity,
      status,
      challanId,
    ]);

    // If status is updated to Confirmed during Edit
    if (status === 'Confirmed') {
      for (const item of productSnapshots) {
        const lockRes = await client.query('SELECT current_stock FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
        const stock = lockRes.rows[0].current_stock;
        if (stock < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for product ${item.name} (${item.sku}). Stock: ${stock}, Requested: ${item.quantity}`,
          });
        }
      }

      for (const item of productSnapshots) {
        await client.query('UPDATE products SET current_stock = current_stock - $1 WHERE id = $2', [item.quantity, item.product_id]);
        await client.query(
          `INSERT INTO stock_movement_logs (product_id, quantity, movement_type, reason, created_by)
           VALUES ($1, $2, 'OUT', $3, $4)`,
          [item.product_id, item.quantity, `Sales Challan ${existingChallan.challan_number} Confirmed`, req.user?.id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      data: {
        ...updatedChallanRes.rows[0],
        items: productSnapshots,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH /api/challans/:id/status
router.patch('/:id/status', authenticateToken, authorizeRoles('Admin', 'Sales', 'Warehouse'), validateRequest(patchStatusSchema), async (req: AuthenticatedRequest, res, next) => {
  const challanId = req.params.id;
  const { status } = req.body;
  const userId = req.user?.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch existing challan status and details
    const challanRes = await client.query('SELECT * FROM sales_challans WHERE id = $1 FOR UPDATE', [challanId]);
    if (challanRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    const challan = challanRes.rows[0];
    const oldStatus = challan.status;

    if (oldStatus === status) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Challan is already in status: ${status}` });
    }

    // Get items
    const itemsRes = await client.query('SELECT * FROM sales_challan_items WHERE challan_id = $1', [challanId]);
    const items = itemsRes.rows;

    // Transition Logic
    if (oldStatus === 'Draft' && status === 'Confirmed') {
      // Deduct Stock
      for (const item of items) {
        if (!item.product_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Product ${item.product_name_snapshot} no longer exists in catalog.` });
        }
        const lockRes = await client.query('SELECT current_stock, name FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
        const stock = lockRes.rows[0].current_stock;
        if (stock < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for product ${lockRes.rows[0].name}. Stock: ${stock}, Requested: ${item.quantity}`,
          });
        }
      }

      for (const item of items) {
        await client.query('UPDATE products SET current_stock = current_stock - $1 WHERE id = $2', [item.quantity, item.product_id]);
        await client.query(
          `INSERT INTO stock_movement_logs (product_id, quantity, movement_type, reason, created_by)
           VALUES ($1, $2, 'OUT', $3, $4)`,
          [item.product_id, item.quantity, `Sales Challan ${challan.challan_number} Confirmed`, userId]
        );
      }
    } else if (oldStatus === 'Confirmed' && status === 'Cancelled') {
      // Revert Stock back to inventory
      for (const item of items) {
        if (item.product_id) {
          await client.query('UPDATE products SET current_stock = current_stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
          await client.query(
            `INSERT INTO stock_movement_logs (product_id, quantity, movement_type, reason, created_by)
             VALUES ($1, $2, 'IN', $3, $4)`,
            [item.product_id, item.quantity, `Sales Challan ${challan.challan_number} Cancelled`, userId]
          );
        }
      }
    } else if (oldStatus === 'Draft' && status === 'Cancelled') {
      // No stock operations needed, just status update
    } else {
      // Invalid status transition (e.g. Cancelled -> Confirmed, Cancelled -> Draft)
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Invalid status transition from ${oldStatus} to ${status}` });
    }

    // Update status
    const updateRes = await client.query(
      'UPDATE sales_challans SET status = $1 WHERE id = $2 RETURNING *',
      [status, challanId]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: updateRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// GET /api/challans/:id/pdf
router.get('/:id/pdf', authenticateToken, async (req, res, next) => {
  try {
    const challanQuery = `
      SELECT c.*, u.username as creator_name
      FROM sales_challans c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = $1
    `;
    const challanResult = await pool.query(challanQuery, [req.params.id]);

    if (challanResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    const challan = challanResult.rows[0];
    const itemsQuery = 'SELECT * FROM sales_challan_items WHERE challan_id = $1';
    const itemsResult = await pool.query(itemsQuery, [req.params.id]);
    const items = itemsResult.rows;

    const cust = challan.customer_snapshot;

    // Create PDF Document
    const doc = new PDFDocument({ margin: 50 });

    // Stream the PDF to the HTTP response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${challan.challan_number}.pdf`);
    doc.pipe(res);

    // Add Invoice Header
    doc.fillColor('#111827').fontSize(24).text('SALES CHALLAN / INVOICE', { align: 'center' });
    doc.moveDown();

    // Vendor / ERP Info
    doc.fontSize(10).fillColor('#4B5563');
    doc.text('Mini ERP & CRM Portal Inc.', { align: 'left' });
    doc.text('GSTIN: 27MINIERP9999A1Z1');
    doc.text('Email: info@minierp.com');
    doc.moveDown();

    // Drawing a dividing line
    doc.moveTo(50, 160).lineTo(550, 160).strokeColor('#E5E7EB').stroke();
    doc.moveDown();

    // Customer Snapshot details and Challan Metadata
    doc.x = 50;
    doc.y = 180;
    doc.fillColor('#111827').fontSize(12).text('BILL TO:', { underline: true });
    doc.fontSize(10).fillColor('#374151');
    doc.text(`Customer Name: ${cust.name || 'N/A'}`);
    doc.text(`Business Name: ${cust.business_name || 'N/A'}`);
    doc.text(`Mobile: ${cust.mobile || 'N/A'}`);
    doc.text(`Email: ${cust.email || 'N/A'}`);
    doc.text(`GST No: ${cust.gst_number || 'N/A'}`);
    doc.text(`Address: ${cust.address || 'N/A'}`);

    // Challan Metadata
    doc.x = 350;
    doc.y = 180;
    doc.fillColor('#111827').fontSize(12).text('CHALLAN METADATA:', { underline: true });
    doc.fontSize(10).fillColor('#374151');
    doc.text(`Challan No: ${challan.challan_number}`);
    doc.text(`Date: ${new Date(challan.created_at).toLocaleDateString()}`);
    doc.text(`Status: ${challan.status}`);
    doc.text(`Generated By: ${challan.creator_name || 'System'}`);

    // Space for Table
    doc.x = 50;
    doc.y = 310;
    doc.moveTo(50, 305).lineTo(550, 305).strokeColor('#D1D5DB').stroke();

    // Table Header
    doc.fillColor('#111827').fontSize(10);
    doc.text('Item SKU', 50, 312, { width: 100 });
    doc.text('Product Name', 150, 312, { width: 200 });
    doc.text('Qty', 350, 312, { width: 50, align: 'right' });
    doc.text('Rate ($)', 400, 312, { width: 70, align: 'right' });
    doc.text('Amount ($)', 470, 312, { width: 80, align: 'right' });

    doc.moveTo(50, 325).lineTo(550, 325).strokeColor('#E5E7EB').stroke();

    let currentY = 332;
    let grandTotal = 0;

    for (const item of items) {
      const qty = parseInt(item.quantity);
      const rate = parseFloat(item.unit_price_snapshot);
      const amt = qty * rate;
      grandTotal += amt;

      doc.fillColor('#4B5563');
      doc.text(item.product_sku_snapshot, 50, currentY, { width: 100 });
      doc.text(item.product_name_snapshot, 150, currentY, { width: 200 });
      doc.text(qty.toString(), 350, currentY, { width: 50, align: 'right' });
      doc.text(rate.toFixed(2), 400, currentY, { width: 70, align: 'right' });
      doc.text(amt.toFixed(2), 470, currentY, { width: 80, align: 'right' });

      currentY += 20;
    }

    doc.moveTo(50, currentY).lineTo(550, currentY).strokeColor('#D1D5DB').stroke();
    currentY += 10;

    // Totals
    doc.fillColor('#111827').fontSize(11);
    doc.text('Grand Total:', 350, currentY, { width: 120, align: 'right' });
    doc.text(`$${grandTotal.toFixed(2)}`, 470, currentY, { width: 80, align: 'right' });

    doc.end();
  } catch (error) {
    next(error);
  }
});

export default router;
