import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { useAuth, API_BASE_URL } from '../context/AuthContext';
import { 
  Plus, 
  Trash2, 
  FileText, 
  Download, 
  Check, 
  X,
  Building
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  business_name: string;
  address: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  unit_price: string;
  current_stock: number;
}

interface ChallanItem {
  id: string;
  product_id: string;
  product_sku_snapshot: string;
  product_name_snapshot: string;
  unit_price_snapshot: string;
  quantity: number;
  current_product_name?: string;
  current_product_sku?: string;
}

interface Challan {
  id: string;
  challan_number: string;
  customer_id: string;
  customer_snapshot: {
    name: string;
    mobile: string;
    email: string;
    business_name: string;
    gst_number: string | null;
    address: string;
  };
  total_quantity: number;
  status: 'Draft' | 'Confirmed' | 'Cancelled';
  created_by: string;
  creator_name?: string;
  customer_name?: string;
  customer_business?: string;
  created_at: string;
  items?: ChallanItem[];
}

export const SalesChallans: React.FC = () => {
  const { token, user } = useAuth();
  const [challans, setChallans] = useState<Challan[]>([]);
  const [selectedChallan, setSelectedChallan] = useState<Challan | null>(null);

  // Lists for creation wizard
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Search & Filter
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newChallanCustId, setNewChallanCustId] = useState('');
  const [newChallanItems, setNewChallanItems] = useState<{ product_id: string; quantity: number }[]>([
    { product_id: '', quantity: 1 }
  ]);
  const [wizardError, setWizardError] = useState<string | null>(null);

  const fetchChallans = async () => {
    setLoading(true);
    try {
      const url = statusFilter 
        ? `${API_BASE_URL}/challans?status=${statusFilter}` 
        : `${API_BASE_URL}/challans`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setChallans(data.data);
      }
    } catch (err) {
      console.error('Error fetching challans:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomersAndProducts = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const custRes = await fetch(`${API_BASE_URL}/customers?limit=100`, { headers });
      const custData = await custRes.json();

      const prodRes = await fetch(`${API_BASE_URL}/products`, { headers });
      const prodData = await prodRes.json();

      if (custData.success && prodData.success) {
        setCustomers(custData.data);
        setProducts(prodData.data);
      }
    } catch (err) {
      console.error('Error fetching select list items:', err);
    }
  };

  useEffect(() => {
    fetchChallans();
  }, [statusFilter, token]);

  useEffect(() => {
    if (isCreating) {
      fetchCustomersAndProducts();
    }
  }, [isCreating]);

  const handleSelectChallan = async (challan: Challan) => {
    try {
      const response = await fetch(`${API_BASE_URL}/challans/${challan.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setSelectedChallan(data.data);
      }
    } catch (err) {
      console.error('Error fetching challan lines:', err);
    }
  };

  // Change Challan Status
  const handleUpdateStatus = async (challanId: string, targetStatus: 'Confirmed' | 'Cancelled') => {
    if (!window.confirm(`Are you sure you want to change status to ${targetStatus}?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/challans/${challanId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await response.json();
      if (data.success) {
        fetchChallans();
        // Refresh details view
        if (selectedChallan?.id === challanId) {
          handleSelectChallan({ ...selectedChallan, status: targetStatus });
        }
      } else {
        alert(data.message || 'Status transition failed.');
      }
    } catch (err) {
      alert('Network error. Failed to change status.');
    }
  };

  // Wizard details helpers
  const handleAddItemRow = () => {
    setNewChallanItems([...newChallanItems, { product_id: '', quantity: 1 }]);
  };

  const handleRemoveItemRow = (index: number) => {
    const list = [...newChallanItems];
    list.splice(index, 1);
    setNewChallanItems(list);
  };

  const handleItemRowChange = (index: number, field: 'product_id' | 'quantity', value: any) => {
    const list = [...newChallanItems];
    if (field === 'product_id') {
      list[index].product_id = value;
    } else {
      list[index].quantity = parseInt(value) || 1;
    }
    setNewChallanItems(list);
  };

  // Calculate wizard totals
  const getWizardTotals = () => {
    let quantity = 0;
    let cost = 0;
    newChallanItems.forEach((item) => {
      if (item.product_id) {
        const prod = products.find((p) => p.id === item.product_id);
        if (prod) {
          quantity += item.quantity;
          cost += parseFloat(prod.unit_price) * item.quantity;
        }
      }
    });
    return { quantity, cost };
  };

  const handleSaveChallan = async (status: 'Draft' | 'Confirmed') => {
    setWizardError(null);
    if (!newChallanCustId) {
      setWizardError('Please select a customer.');
      return;
    }
    
    const validItems = newChallanItems.filter((i) => i.product_id !== '');
    if (validItems.length === 0) {
      setWizardError('Challan must contain at least one product.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/challans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customer_id: newChallanCustId,
          items: validItems,
          status,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setIsCreating(false);
        fetchChallans();
        setSelectedChallan(null);
      } else {
        setWizardError(data.message || 'Failed to create sales challan.');
      }
    } catch (err) {
      setWizardError('Connection error. Failed to save.');
    }
  };

  const isSalesOrAdmin = user && ['Admin', 'Sales'].includes(user.role);
  const isWarehouseOrAdmin = user && ['Admin', 'Warehouse'].includes(user.role);

  return (
    <DashboardLayout title="Sales Challan Ledger">
      {/* Filters bar */}
      <div className="filters-bar">
        <select
          className="form-control select-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <div style={{ flexGrow: 1 }}></div>

        {isSalesOrAdmin && (
          <button className="btn btn-primary" onClick={() => {
            setNewChallanCustId('');
            setNewChallanItems([{ product_id: '', quantity: 1 }]);
            setWizardError(null);
            setIsCreating(true);
          }}>
            <Plus size={18} /> New Sales Challan
          </button>
        )}
      </div>

      <div className="detail-grid">
        {/* Left Column: Challans Table */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          {loading ? (
            <p style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading ledger...</p>
          ) : challans.length === 0 ? (
            <p style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>No sales challans recorded.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Challan No</th>
                    <th>Customer</th>
                    <th style={{ textAlign: 'right' }}>Total Units</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {challans.map((ch) => (
                    <tr 
                      key={ch.id} 
                      onClick={() => handleSelectChallan(ch)}
                      style={{ 
                        cursor: 'pointer',
                        background: selectedChallan?.id === ch.id ? 'var(--bg-glass-active)' : 'transparent',
                        borderLeft: selectedChallan?.id === ch.id ? '3px solid var(--primary)' : 'none'
                      }}
                    >
                      <td>
                        <div style={{ fontWeight: 600 }}>{ch.challan_number}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Date: {new Date(ch.created_at).toLocaleDateString()}</div>
                      </td>
                      <td>{ch.customer_snapshot?.business_name || ch.customer_business}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{ch.total_quantity}</td>
                      <td>
                        <span className={`badge ${
                          ch.status === 'Confirmed' ? 'badge-success' :
                          ch.status === 'Draft' ? 'badge-primary' : 'badge-danger'
                        }`}>
                          {ch.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Invoice Details View */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          {selectedChallan ? (
            <div>
              {/* Invoice header metadata */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Challan {selectedChallan.challan_number}</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Created: {new Date(selectedChallan.created_at).toLocaleString()} | By: {selectedChallan.creator_name || 'System'}
                  </div>
                </div>
                <span className={`badge ${
                  selectedChallan.status === 'Confirmed' ? 'badge-success' :
                  selectedChallan.status === 'Draft' ? 'badge-primary' : 'badge-danger'
                }`}>
                  {selectedChallan.status}
                </span>
              </div>

              {/* Bill To details */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={14} /> Bill To Customer:
                </h4>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedChallan.customer_snapshot.name}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Company: {selectedChallan.customer_snapshot.business_name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Mobile: {selectedChallan.customer_snapshot.mobile} | Email: {selectedChallan.customer_snapshot.email}
                </div>
                {selectedChallan.customer_snapshot.gst_number && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>GSTIN: {selectedChallan.customer_snapshot.gst_number}</div>
                )}
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Address: {selectedChallan.customer_snapshot.address}</div>
              </div>

              {/* Items Breakdown Table */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Line Items Breakdown:</h4>
                <div className="table-container">
                  <table className="data-table" style={{ fontSize: '0.9rem' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 12px' }}>Product SKU & Name</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Price</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedChallan.items?.map((item) => {
                        const price = parseFloat(item.unit_price_snapshot);
                        const qty = item.quantity;
                        const amt = price * qty;
                        return (
                          <tr key={item.id}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 600 }}>{item.product_name_snapshot}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SKU: {item.product_sku_snapshot}</div>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{qty}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>${price.toFixed(2)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>${amt.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Grand Total calculation */}
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '32px', marginBottom: '24px' }}>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Quantity: </span>
                  <strong style={{ fontSize: '1.1rem' }}>{selectedChallan.total_quantity} units</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Grand Total: </span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--accent)' }}>
                    ${selectedChallan.items?.reduce((acc, i) => acc + parseFloat(i.unit_price_snapshot) * i.quantity, 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Action Operations panel */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {selectedChallan.status === 'Draft' && isSalesOrAdmin && (
                  <button 
                    className="btn btn-primary" 
                    onClick={() => handleUpdateStatus(selectedChallan.id, 'Confirmed')}
                    style={{ flexGrow: 1 }}
                  >
                    <Check size={16} /> Confirm & Commit Stock
                  </button>
                )}
                {selectedChallan.status === 'Confirmed' && isWarehouseOrAdmin && (
                  <button 
                    className="btn btn-danger" 
                    onClick={() => handleUpdateStatus(selectedChallan.id, 'Cancelled')}
                    style={{ flexGrow: 1 }}
                  >
                    <X size={16} /> Cancel Challan & Revert Stock
                  </button>
                )}
                {selectedChallan.status === 'Draft' && isSalesOrAdmin && (
                  <button 
                    className="btn btn-danger" 
                    onClick={() => handleUpdateStatus(selectedChallan.id, 'Cancelled')}
                    style={{ flexGrow: 1 }}
                  >
                    <X size={16} /> Cancel Draft
                  </button>
                )}
                {selectedChallan.status === 'Confirmed' && (
                  <a 
                    href={`${API_BASE_URL}/challans/${selectedChallan.id}/pdf?token=${token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none', flexGrow: 1 }}
                  >
                    <Download size={16} /> Download Invoice PDF
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <FileText size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <p>Select a sales challan from the list to view billing information, product logs, and download invoice copies.</p>
            </div>
          )}
        </div>
      </div>

      {/* CREATE NEW CHALLAN FULLSCREEN WIZARD MODAL */}
      {isCreating && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '750px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Create Sales Challan Draft</h3>
              <button className="modal-close" onClick={() => setIsCreating(false)}><X size={20} /></button>
            </div>

            {wizardError && (
              <div className="alert-card alert-danger" style={{ marginBottom: '20px' }}>{wizardError}</div>
            )}

            <div className="form-group">
              <label className="form-label">1. Select CRM Customer Account *</label>
              <select
                className="form-control"
                value={newChallanCustId}
                onChange={(e) => setNewChallanCustId(e.target.value)}
              >
                <option value="">-- Choose Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.business_name})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span>2. Challan Line Items *</span>
                <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={handleAddItemRow}>
                  + Add Product Item
                </button>
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '220px', overflowY: 'auto', paddingRight: '8px' }}>
                {newChallanItems.map((row, idx) => {
                  const selectedProd = products.find((p) => p.id === row.product_id);
                  const isStockInsufficient = selectedProd && selectedProd.current_stock < row.quantity;
                  
                  return (
                    <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <select
                        className="form-control"
                        style={{ flexGrow: 3 }}
                        value={row.product_id}
                        onChange={(e) => handleItemRowChange(idx, 'product_id', e.target.value)}
                      >
                        <option value="">-- Choose Product --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (SKU: {p.sku} | Price: ${parseFloat(p.unit_price).toFixed(2)} | Avail: {p.current_stock})
                          </option>
                        ))}
                      </select>

                      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: '80px' }}>
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          className="form-control"
                          value={row.quantity}
                          onChange={(e) => handleItemRowChange(idx, 'quantity', e.target.value)}
                        />
                        {isStockInsufficient && (
                          <span style={{ color: 'var(--danger)', fontSize: '0.7rem', fontWeight: 600, marginTop: '2px' }}>
                            Insuf. Stock ({selectedProd.current_stock})
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '12px', border: '1px solid var(--danger)', color: 'var(--danger)' }}
                        disabled={newChallanItems.length <= 1}
                        onClick={() => handleRemoveItemRow(idx)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Subtotal previews */}
            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Dynamic Order Cost Summary:</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                  ${getWizardTotals().cost.toFixed(2)}
                </div>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Items count: <strong>{getWizardTotals().quantity} units</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsCreating(false)}>Cancel</button>
              <button type="button" className="btn btn-secondary" onClick={() => handleSaveChallan('Draft')}>
                Save as Draft
              </button>
              <button type="button" className="btn btn-primary" onClick={() => handleSaveChallan('Confirmed')}>
                Confirm & Deduct Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
