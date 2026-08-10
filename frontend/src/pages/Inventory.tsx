import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { useAuth, API_BASE_URL } from '../context/AuthContext';
import { 
  Search, 
  Plus, 
  Edit2, 
  Package, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  X,
  History
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit_price: string;
  current_stock: number;
  min_stock_alert: number;
  location: string;
  created_at: string;
}

interface MovementLog {
  id: string;
  product_id: string;
  quantity: number;
  movement_type: 'IN' | 'OUT';
  reason: string;
  created_by_user: string;
  created_at: string;
}

export const Inventory: React.FC = () => {
  const { token, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<MovementLog[]>([]);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [loading, setLoading] = useState(true);

  // Categories list derived or hardcoded
  const categories = ['Raw Materials', 'Electrical', 'Packaging', 'Fasteners', 'Finished Goods'];

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Raw Materials',
    unit_price: 0,
    current_stock: 0,
    min_stock_alert: 5,
    location: '',
  });

  const [adjustData, setAdjustData] = useState({
    quantity: 1,
    movement_type: 'IN' as 'IN' | 'OUT',
    reason: '',
  });

  const [formError, setFormError] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        search,
        category: categoryFilter,
        lowStock: lowStockFilter.toString(),
      });
      const response = await fetch(`${API_BASE_URL}/products?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setProducts(data.data);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [search, categoryFilter, lowStockFilter, token]);

  const fetchMovements = async (productId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/movements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setMovements(data.data);
      }
    } catch (err) {
      console.error('Error fetching movements:', err);
    }
  };

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    fetchMovements(prod.id);
  };

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      sku: '',
      category: 'Raw Materials',
      unit_price: 0,
      current_stock: 0,
      min_stock_alert: 5,
      location: '',
    });
    setFormError(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (prod: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormData({
      name: prod.name,
      sku: prod.sku,
      category: prod.category,
      unit_price: parseFloat(prod.unit_price),
      current_stock: prod.current_stock,
      min_stock_alert: prod.min_stock_alert,
      location: prod.location,
    });
    setSelectedProduct(prod);
    setFormError(null);
    setShowEditModal(true);
  };

  const handleOpenAdjustModal = (prod: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setAdjustData({
      quantity: 1,
      movement_type: 'IN',
      reason: '',
    });
    setSelectedProduct(prod);
    setFormError(null);
    setShowAdjustModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent, isEdit: boolean) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name || !formData.sku || !formData.location || formData.unit_price < 0) {
      setFormError('Please check form fields. Prices cannot be negative.');
      return;
    }

    try {
      const url = isEdit 
        ? `${API_BASE_URL}/products/${selectedProduct?.id}` 
        : `${API_BASE_URL}/products`;
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        setShowAddModal(false);
        setShowEditModal(false);
        fetchProducts();
        if (isEdit) {
          setSelectedProduct(data.data);
          fetchMovements(data.data.id);
        }
      } else {
        setFormError(data.message || 'An error occurred while saving.');
      }
    } catch (err) {
      setFormError('Connection error. Failed to save product.');
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (adjustData.quantity <= 0 || !adjustData.reason.trim()) {
      setFormError('Quantity must be positive and reason cannot be blank.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/products/${selectedProduct?.id}/adjust-stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(adjustData),
      });

      const data = await response.json();
      if (data.success) {
        setShowAdjustModal(false);
        fetchProducts();
        setSelectedProduct(data.data);
        fetchMovements(data.data.id);
      } else {
        setFormError(data.message || 'Stock adjustment failed.');
      }
    } catch (err) {
      setFormError('Connection error. Failed to adjust stock.');
    }
  };

  const isWarehouseOrAdmin = user && ['Admin', 'Warehouse'].includes(user.role);

  return (
    <DashboardLayout title="Inventory & Stock Manager">
      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="search-input-wrapper" style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search by product name, SKU, location..."
            style={{ paddingLeft: '44px' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="form-control select-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={lowStockFilter}
            onChange={(e) => setLowStockFilter(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
          />
          Show Low Stock Warnings
        </label>

        {isWarehouseOrAdmin && (
          <button className="btn btn-primary" onClick={handleOpenAddModal}>
            <Plus size={18} /> Add Catalog Item
          </button>
        )}
      </div>

      <div className="detail-grid">
        {/* Left Column: Products List */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          {loading ? (
            <p style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading catalog...</p>
          ) : products.length === 0 ? (
            <p style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>No items match criteria.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product & SKU</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Stock Level</th>
                    <th style={{ textAlign: 'right' }}>Unit Rate</th>
                    {isWarehouseOrAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod) => {
                    const isLowStock = prod.current_stock <= prod.min_stock_alert;
                    return (
                      <tr 
                        key={prod.id} 
                        onClick={() => handleSelectProduct(prod)}
                        style={{ 
                          cursor: 'pointer',
                          background: selectedProduct?.id === prod.id ? 'var(--bg-glass-active)' : 'transparent',
                          borderLeft: selectedProduct?.id === prod.id ? '3px solid var(--primary)' : 'none'
                        }}
                      >
                        <td>
                          <div style={{ fontWeight: 600 }}>{prod.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SKU: {prod.sku} | Loc: {prod.location}</div>
                        </td>
                        <td>{prod.category}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          <span className={isLowStock ? 'text-warning' : 'text-success'} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {isLowStock && <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />}
                            {prod.current_stock}
                          </span>
                          <div style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>Min: {prod.min_stock_alert}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>${parseFloat(prod.unit_price).toFixed(2)}</td>
                        {isWarehouseOrAdmin && (
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                                onClick={(e) => handleOpenAdjustModal(prod, e)}
                                title="Adjust Stock IN/OUT"
                              >
                                Adjust
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                                onClick={(e) => handleOpenEditModal(prod, e)}
                                title="Edit Catalog Properties"
                              >
                                <Edit2 size={12} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Detail Audit Logs */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          {selectedProduct ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedProduct.name}</h3>
                  <span className="user-role" style={{ color: 'var(--text-secondary)' }}>SKU: {selectedProduct.sku} | Location: {selectedProduct.location}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Current Inventory</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: selectedProduct.current_stock <= selectedProduct.min_stock_alert ? 'var(--warning)' : 'var(--success)' }}>
                    {selectedProduct.current_stock}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Wholesale Price</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                    ${parseFloat(selectedProduct.unit_price).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Movement Ledger */}
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={16} />
                  Stock Movement Audit Log
                </h4>

                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  {movements.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No historical logs for this product.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {movements.map((log) => (
                        <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
                          {log.movement_type === 'IN' ? (
                            <TrendingUp size={16} style={{ color: 'var(--success)' }} />
                          ) : (
                            <TrendingDown size={16} style={{ color: 'var(--danger)' }} />
                          )}
                          <div style={{ flexGrow: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                              {log.movement_type === 'IN' ? '+' : '-'}{log.quantity} units - {log.reason}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              By {log.created_by_user || 'System'} on {new Date(log.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <Package size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <p>Select a product to view detailed specifications, storage coordinates, and transaction audit logs.</p>
            </div>
          )}
        </div>
      </div>

      {/* ADD CATALOG PRODUCT MODAL */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h3 className="modal-title">Log New Product Catalog Entry</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>

            {formError && (
              <div className="alert-card alert-danger" style={{ marginBottom: '20px' }}>{formError}</div>
            )}

            <form onSubmit={(e) => handleSaveProduct(e, false)}>
              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">SKU Code *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. STL-2MM-001"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    className="form-control"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Unit Rate ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    required
                    value={formData.unit_price}
                    onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Warehouse Storage location *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Warehouse A - Shelf 3"
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Initial Stock Count *</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    value={formData.current_stock}
                    onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Min Stock Threshold Alert *</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    value={formData.min_stock_alert}
                    onChange={(e) => setFormData({ ...formData, min_stock_alert: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT MODAL */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h3 className="modal-title">Edit Product Properties</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}><X size={20} /></button>
            </div>

            {formError && (
              <div className="alert-card alert-danger" style={{ marginBottom: '20px' }}>{formError}</div>
            )}

            <form onSubmit={(e) => handleSaveProduct(e, true)}>
              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">SKU Code *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    className="form-control"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Unit Rate ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    required
                    value={formData.unit_price}
                    onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Warehouse Storage location *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Min Stock Threshold Alert *</label>
                <input
                  type="number"
                  className="form-control"
                  required
                  value={formData.min_stock_alert}
                  onChange={(e) => setFormData({ ...formData, min_stock_alert: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST INVENTORY STOCK MODAL */}
      {showAdjustModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Adjust Stock Level</h3>
              <button className="modal-close" onClick={() => setShowAdjustModal(false)}><X size={20} /></button>
            </div>

            {formError && (
              <div className="alert-card alert-danger" style={{ marginBottom: '20px' }}>{formError}</div>
            )}

            <div style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Product Profile:</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '2px' }}>{selectedProduct?.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                SKU: {selectedProduct?.sku} | Current Stock: <strong>{selectedProduct?.current_stock}</strong>
              </div>
            </div>

            <form onSubmit={handleAdjustStock}>
              <div className="form-group">
                <label className="form-label">Operation Type *</label>
                <select
                  className="form-control"
                  value={adjustData.movement_type}
                  onChange={(e) => setAdjustData({ ...adjustData, movement_type: e.target.value as 'IN' | 'OUT' })}
                >
                  <option value="IN">Increase Stock (IN)</option>
                  <option value="OUT">Decrease Stock (OUT)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Quantity Shift Magnitude *</label>
                <input
                  type="number"
                  min="1"
                  className="form-control"
                  required
                  value={adjustData.quantity}
                  onChange={(e) => setAdjustData({ ...adjustData, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Audit Adjust Reason *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Damaged inventory write-off, Purchase intake"
                  required
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Process Adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
