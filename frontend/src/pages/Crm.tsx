import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { useAuth, API_BASE_URL } from '../context/AuthContext';
import { 
  Search, 
  Plus, 
  Edit2, 
  Phone, 
  Mail, 
  Building, 
  MapPin, 
  Calendar,
  Send,
  X,
  Users
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  business_name: string;
  gst_number: string | null;
  type: 'Retail' | 'Wholesale' | 'Distributor';
  address: string;
  status: 'Lead' | 'Active' | 'Inactive';
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
}

interface Note {
  id: string;
  customer_id: string;
  note: string;
  created_by: string;
  created_at: string;
  author: string;
}

export const Crm: React.FC = () => {
  const { token, user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  
  // Search and Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    business_name: '',
    gst_number: '',
    type: 'Wholesale' as Customer['type'],
    address: '',
    status: 'Lead' as Customer['status'],
    follow_up_date: '',
    notes: '',
  });

  const [formError, setFormError] = useState<string | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        search,
        status: statusFilter,
        type: typeFilter,
        page: page.toString(),
        limit: '6',
      });
      const response = await fetch(`${API_BASE_URL}/customers?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setCustomers(data.data);
        setTotalPages(data.pagination.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search, statusFilter, typeFilter, page, token]);

  const fetchNotes = async (customerId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${customerId}/notes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setNotes(data.data);
      }
    } catch (err) {
      console.error('Error fetching customer notes:', err);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    fetchNotes(customer.id);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !selectedCustomer) return;

    try {
      const response = await fetch(`${API_BASE_URL}/customers/${selectedCustomer.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: newNoteText }),
      });
      const data = await response.json();
      if (data.success) {
        setNotes([data.data, ...notes]);
        setNewNoteText('');
        // Update summary notes on selected customer local instance
        setSelectedCustomer({
          ...selectedCustomer,
          notes: data.data.note
        });
      }
    } catch (err) {
      console.error('Error adding note:', err);
    }
  };

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      mobile: '',
      email: '',
      business_name: '',
      gst_number: '',
      type: 'Wholesale',
      address: '',
      status: 'Lead',
      follow_up_date: '',
      notes: '',
    });
    setFormError(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (cust: Customer, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent row click selection toggle
    setFormData({
      name: cust.name,
      mobile: cust.mobile,
      email: cust.email,
      business_name: cust.business_name,
      gst_number: cust.gst_number || '',
      type: cust.type,
      address: cust.address,
      status: cust.status,
      follow_up_date: cust.follow_up_date ? cust.follow_up_date.substring(0, 10) : '',
      notes: cust.notes || '',
    });
    setFormError(null);
    setSelectedCustomer(cust);
    setShowEditModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent, isEdit: boolean) => {
    e.preventDefault();
    setFormError(null);

    // Basic Validation
    if (!formData.name || !formData.mobile || !formData.email || !formData.business_name || !formData.address) {
      setFormError('Please fill in all required fields.');
      return;
    }

    try {
      const url = isEdit 
        ? `${API_BASE_URL}/customers/${selectedCustomer?.id}` 
        : `${API_BASE_URL}/customers`;
      
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
        fetchCustomers();
        if (isEdit) {
          setSelectedCustomer(data.data);
          fetchNotes(data.data.id);
        }
      } else {
        setFormError(data.message || 'An error occurred while saving.');
      }
    } catch (err) {
      setFormError('Connection error. Failed to save.');
    }
  };

  const isSalesOrAdmin = user && ['Admin', 'Sales'].includes(user.role);

  return (
    <DashboardLayout title="CRM Customer Directory">
      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="search-input-wrapper" style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search by name, company, email..."
            style={{ paddingLeft: '44px' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="form-control select-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Lead">Lead</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>

        <select
          className="form-control select-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="Retail">Retail</option>
          <option value="Wholesale">Wholesale</option>
          <option value="Distributor">Distributor</option>
        </select>

        {isSalesOrAdmin && (
          <button className="btn btn-primary" onClick={handleOpenAddModal}>
            <Plus size={18} /> Add Customer
          </button>
        )}
      </div>

      <div className="detail-grid">
        {/* Left Column: Customers Table */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          {loading ? (
            <p style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading customer registry...</p>
          ) : customers.length === 0 ? (
            <p style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>No customers found matching criteria.</p>
          ) : (
            <>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Company</th>
                      <th>Type</th>
                      <th>Status</th>
                      {isSalesOrAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((cust) => (
                      <tr 
                        key={cust.id} 
                        onClick={() => handleSelectCustomer(cust)}
                        style={{ 
                          cursor: 'pointer',
                          background: selectedCustomer?.id === cust.id ? 'var(--bg-glass-active)' : 'transparent',
                          borderLeft: selectedCustomer?.id === cust.id ? '3px solid var(--primary)' : 'none'
                        }}
                      >
                        <td style={{ fontWeight: 600 }}>{cust.name}</td>
                        <td>{cust.business_name}</td>
                        <td>{cust.type}</td>
                        <td>
                          <span className={`badge ${
                            cust.status === 'Active' ? 'badge-success' :
                            cust.status === 'Lead' ? 'badge-primary' : 'badge-danger'
                          }`}>
                            {cust.status}
                          </span>
                        </td>
                        {isSalesOrAdmin && (
                          <td style={{ textAlign: 'right' }}>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                              onClick={(e) => handleOpenEditModal(cust, e)}
                            >
                              <Edit2 size={12} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      className={`btn ${p === page ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '6px 12px', minWidth: '36px', fontSize: '0.85rem' }}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Column: Customer Details Drawer */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          {selectedCustomer ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedCustomer.name}</h3>
                  <span className="user-role" style={{ color: 'var(--text-secondary)' }}>{selectedCustomer.business_name}</span>
                </div>
                <span className={`badge ${
                  selectedCustomer.status === 'Active' ? 'badge-success' :
                  selectedCustomer.status === 'Lead' ? 'badge-primary' : 'badge-danger'
                }`}>
                  {selectedCustomer.status}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Phone size={14} /> <span>{selectedCustomer.mobile}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Mail size={14} /> <span>{selectedCustomer.email}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Building size={14} /> <span>GSTIN: {selectedCustomer.gst_number || 'Not provided'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <MapPin size={14} style={{ marginTop: '2px' }} /> <span>{selectedCustomer.address}</span>
                </div>
                {selectedCustomer.follow_up_date && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--warning)', fontWeight: 600 }}>
                    <Calendar size={14} /> 
                    <span>Next Follow-up: {new Date(selectedCustomer.follow_up_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Note History Timeline */}
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '16px' }}>CRM Follow-Up Ledger</h4>
                
                {isSalesOrAdmin && (
                  <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Log follow-up discussion..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '12px' }}>
                      <Send size={16} />
                    </button>
                  </form>
                )}

                <div className="timeline" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
                  {notes.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No follow-up interactions logged yet.</p>
                  ) : (
                    notes.map((n) => (
                      <div className="timeline-item" key={n.id}>
                        <div className="timeline-header">
                          <span style={{ fontWeight: 600 }}>{n.author}</span>
                          <span>{new Date(n.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="timeline-body">{n.note}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <Users size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <p>Select a customer from the left list to view follow-up records and add history logs.</p>
            </div>
          )}
        </div>
      </div>

      {/* ADD CUSTOMER MODAL */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h3 className="modal-title">Log New Customer Profile</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            
            {formError && (
              <div className="alert-card alert-danger" style={{ marginBottom: '20px' }}>{formError}</div>
            )}

            <form onSubmit={(e) => handleSaveCustomer(e, false)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Business Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Mobile Number *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">GST Number (Optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 27AAAAA1111A1Z1"
                    value={formData.gst_number}
                    onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer Classification *</label>
                  <select
                    className="form-control"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Customer['type'] })}
                  >
                    <option value="Wholesale">Wholesale</option>
                    <option value="Retail">Retail</option>
                    <option value="Distributor">Distributor</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Billing Address *</label>
                <textarea
                  className="form-control"
                  style={{ height: '80px', resize: 'none' }}
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">CRM Lifecycle *</label>
                  <select
                    className="form-control"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Customer['status'] })}
                  >
                    <option value="Lead">Lead</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Next Follow-up Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={formData.follow_up_date}
                    onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Discussion Notes (First Follow-up)</label>
                <textarea
                  className="form-control"
                  style={{ height: '60px', resize: 'none' }}
                  placeholder="Details of initial conversation..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CUSTOMER MODAL */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h3 className="modal-title">Edit Customer Profile</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}><X size={20} /></button>
            </div>
            
            {formError && (
              <div className="alert-card alert-danger" style={{ marginBottom: '20px' }}>{formError}</div>
            )}

            <form onSubmit={(e) => handleSaveCustomer(e, true)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Business Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Mobile Number *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">GST Number</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.gst_number}
                    onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer Classification *</label>
                  <select
                    className="form-control"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Customer['type'] })}
                  >
                    <option value="Wholesale">Wholesale</option>
                    <option value="Retail">Retail</option>
                    <option value="Distributor">Distributor</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Billing Address *</label>
                <textarea
                  className="form-control"
                  style={{ height: '80px', resize: 'none' }}
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">CRM Lifecycle *</label>
                  <select
                    className="form-control"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Customer['status'] })}
                  >
                    <option value="Lead">Lead</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Next Follow-up Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={formData.follow_up_date}
                    onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
