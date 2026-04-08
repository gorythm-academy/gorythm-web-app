import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import './PaymentsManagement.scss';

const COLUMN_DEFS = ['checkbox', 'transactionId', 'student', 'course', 'amount', 'email', 'status', 'method', 'date', 'actions'];
const DEFAULT_COLUMN_WIDTHS = [60, 230, 220, 220, 130, 230, 130, 130, 190, 150];
const COLUMN_MIN_WIDTHS = [50, 120, 140, 140, 90, 140, 100, 100, 130, 120];
const COLUMN_MAX_WIDTHS = [90, 380, 360, 360, 220, 420, 220, 220, 320, 260];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const PaymentsManagement = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [dateRange, setDateRange] = useState('all');
    const [stats, setStats] = useState({
        totalRevenue: 0,
        successfulPayments: 0,
        pendingPayments: 0,
        failedPayments: 0
    });
    const tableContainerRef = useRef(null);
    const dragStateRef = useRef({
        isDragging: false,
        startX: 0,
        startScrollLeft: 0,
    });
    const [isTableDragging, setIsTableDragging] = useState(false);
    const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
    const [sortBy, setSortBy] = useState('date');
    const [sortOrder, setSortOrder] = useState('desc');
    const [selectedPayments, setSelectedPayments] = useState([]);

    const fetchPayments = useCallback(async () => {
        try {
            setLoading(true);
            
            // Mock payment data
            const mockPayments = [
                {
                    _id: '1',
                    transactionId: 'txn_123456789',
                    user: { name: 'Ahmed Khan', email: 'ahmed@example.com' },
                    course: { title: 'Quranic Arabic Course' },
                    amount: 49.00,
                    currency: 'USD',
                    status: 'completed',
                    paymentMethod: 'stripe',
                    createdAt: '2024-12-29T10:30:00Z'
                },
                {
                    _id: '2',
                    transactionId: 'txn_987654321',
                    user: { name: 'Fatima Ali', email: 'fatima@example.com' },
                    course: { title: 'Tajweed Mastery' },
                    amount: 39.00,
                    currency: 'USD',
                    status: 'completed',
                    paymentMethod: 'paypal',
                    createdAt: '2024-12-28T14:45:00Z'
                },
                {
                    _id: '3',
                    transactionId: 'txn_555555555',
                    user: { name: 'Omar Hussain', email: 'omar@example.com' },
                    course: { title: 'Islamic Studies' },
                    amount: 59.00,
                    currency: 'USD',
                    status: 'pending',
                    paymentMethod: 'stripe',
                    createdAt: '2024-12-30T09:15:00Z'
                },
                {
                    _id: '4',
                    transactionId: 'txn_444444444',
                    user: { name: 'Sarah Johnson', email: 'sarah@example.com' },
                    course: { title: 'STEM with Islamic Perspective' },
                    amount: 79.00,
                    currency: 'USD',
                    status: 'failed',
                    paymentMethod: 'stripe',
                    createdAt: '2024-12-27T16:20:00Z'
                },
                {
                    _id: '5',
                    transactionId: 'txn_333333333',
                    user: { name: 'Michael Chen', email: 'michael@example.com' },
                    course: { title: 'Quranic Arabic Course' },
                    amount: 49.00,
                    currency: 'USD',
                    status: 'completed',
                    paymentMethod: 'stripe',
                    createdAt: '2024-12-26T11:10:00Z'
                }
            ];

            // Try backend first
            try {
                const token = getAuthToken();
                const response = await axios.get('http://localhost:5000/api/payments', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const fetchedPayments = response.data.payments || mockPayments;
                setPayments(fetchedPayments);
                calculateStats(fetchedPayments);
            } catch {
                setPayments(mockPayments);
                calculateStats(mockPayments);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching payments:', error);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    const startTableDragScroll = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, .col-resizer')) return;

        const el = tableContainerRef.current;
        if (!el) return;

        dragStateRef.current = {
            isDragging: true,
            startX: e.clientX,
            startScrollLeft: el.scrollLeft,
        };
        setIsTableDragging(true);
    };

    const onTableDragScroll = (e) => {
        const el = tableContainerRef.current;
        const dragState = dragStateRef.current;
        if (!el || !dragState.isDragging) return;

        const deltaX = e.clientX - dragState.startX;
        el.scrollLeft = dragState.startScrollLeft - deltaX;
    };

    const stopTableDragScroll = () => {
        if (!dragStateRef.current.isDragging) return;
        dragStateRef.current.isDragging = false;
        setIsTableDragging(false);
    };

    const startColumnResize = (e, colIndex) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = columnWidths[colIndex];
        const minWidth = COLUMN_MIN_WIDTHS[colIndex] ?? 80;
        const maxWidth = COLUMN_MAX_WIDTHS[colIndex] ?? 600;
        let rafId = null;
        let latestWidth = startWidth;

        const onPointerMove = (ev) => {
            latestWidth = clamp(startWidth + (ev.clientX - startX), minWidth, maxWidth);
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                setColumnWidths((prev) => {
                    const next = [...prev];
                    next[colIndex] = latestWidth;
                    return next;
                });
            });
        };

        const stop = () => {
            window.removeEventListener('pointermove', onPointerMove);
            if (rafId) window.cancelAnimationFrame(rafId);
            document.body.style.cursor = '';
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stop, { once: true });
        window.addEventListener('pointercancel', stop, { once: true });
        document.body.style.cursor = 'col-resize';
    };

    const resetColumnWidth = (colIndex) => {
        setColumnWidths((prev) => {
            const next = [...prev];
            next[colIndex] = DEFAULT_COLUMN_WIDTHS[colIndex];
            return next;
        });
    };

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(column);
            setSortOrder(column === 'date' ? 'desc' : 'asc');
        }
    };

    const togglePaymentSelection = (paymentId) => {
        setSelectedPayments((prev) =>
            prev.includes(paymentId) ? prev.filter((id) => id !== paymentId) : [...prev, paymentId]
        );
    };

    const calculateStats = (paymentData) => {
        const stats = {
            totalRevenue: 0,
            successfulPayments: 0,
            pendingPayments: 0,
            failedPayments: 0
        };

        paymentData.forEach(payment => {
            if (payment.status === 'completed') {
                stats.totalRevenue += payment.amount;
                stats.successfulPayments++;
            } else if (payment.status === 'pending') {
                stats.pendingPayments++;
            } else if (payment.status === 'failed') {
                stats.failedPayments++;
            }
        });

        setStats(stats);
    };

    const filteredPayments = payments.filter(payment => {
        const matchesSearch = 
            (payment.user?.name || payment.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (payment.user?.email || payment.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (payment.course?.title || payment.courseName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (payment.transactionId || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = filterStatus === 'all' || payment.status === filterStatus;
        
        // Date filtering (simplified)
        const paymentDate = new Date(payment.createdAt);
        const now = new Date();
        let matchesDate = true;
        
        if (dateRange === 'today') {
            matchesDate = paymentDate.toDateString() === now.toDateString();
        } else if (dateRange === 'week') {
            const weekAgo = new Date(now.setDate(now.getDate() - 7));
            matchesDate = paymentDate >= weekAgo;
        } else if (dateRange === 'month') {
            const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
            matchesDate = paymentDate >= monthAgo;
        }
        
        return matchesSearch && matchesStatus && matchesDate;
    });

    const sortedPayments = [...filteredPayments].sort((a, b) => {
        const mult = sortOrder === 'asc' ? 1 : -1;
        const getVal = (p, key) => {
            if (key === 'transactionId') return (p.transactionId || '').toLowerCase();
            if (key === 'student') return (p.user?.name || p.studentName || '').toLowerCase();
            if (key === 'course') return (p.course?.title || p.courseName || '').toLowerCase();
            if (key === 'amount') return Number(p.amount) || 0;
            if (key === 'email') return (p.user?.email || p.email || '').toLowerCase();
            if (key === 'status') return (p.status || '').toLowerCase();
            if (key === 'method') return (p.paymentMethod || '').toLowerCase();
            if (key === 'date') return new Date(p.createdAt || 0).getTime();
            return 0;
        };
        const va = getVal(a, sortBy);
        const vb = getVal(b, sortBy);
        if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
        return mult * (va < vb ? -1 : va > vb ? 1 : 0);
    });

    const toggleAllPayments = () => {
        const visibleIds = sortedPayments.map((payment) => payment._id);
        if (visibleIds.length > 0 && selectedPayments.length === visibleIds.length) {
            setSelectedPayments([]);
        } else {
            setSelectedPayments(visibleIds);
        }
    };

    const handleRefund = async (paymentId) => {
        if (!window.confirm('Issue refund for this payment?')) return;
        
        try {
            const token = getAuthToken();
            await axios.post(`http://localhost:5000/api/payments/${paymentId}/refund`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            alert('Refund initiated successfully');
            fetchPayments(); // Refresh data
        } catch (error) {
            alert('Refund failed: ' + (error.response?.data?.error || error.message));
        }
    };

    const exportPayments = () => {
        const csvData = filteredPayments.map(p => ({
            'Transaction ID': p.transactionId,
            'Student': p.user?.name || p.studentName || 'Unknown',
            'Email': p.user?.email || p.email || '',
            'Course': p.course?.title || p.courseName || 'Unknown Course',
            'Amount': `$${p.amount}`,
            'Status': p.status,
            'Payment Method': p.paymentMethod,
            'Date & Time': new Date(p.createdAt).toLocaleString()
        }));

        const csvContent = [
            Object.keys(csvData[0]).join(','),
            ...csvData.map(row => Object.values(row).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payments_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    if (loading) {
        return (
            <div className="payments-management loading">
                <div className="loading-spinner">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading payments...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="payments-management">
            {/* Header */}
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-credit-card"></i> Payment Management</h1>
                    <p>Monitor and manage all payment transactions</p>
                </div>
                <div className="header-right">
                    <button className="btn-primary" onClick={exportPayments}>
                        <i className="fas fa-download"></i> Export CSV
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card revenue">
                    <div className="stat-icon">
                        <i className="fas fa-dollar-sign"></i>
                    </div>
                    <div className="stat-info">
                        <h3>${stats.totalRevenue.toFixed(2)}</h3>
                        <p>Total Revenue</p>
                    </div>
                </div>
                <div className="stat-card success">
                    <div className="stat-icon">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.successfulPayments}</h3>
                        <p>Successful</p>
                    </div>
                </div>
                <div className="stat-card pending">
                    <div className="stat-icon">
                        <i className="fas fa-clock"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.pendingPayments}</h3>
                        <p>Pending</p>
                    </div>
                </div>
                <div className="stat-card failed">
                    <div className="stat-icon">
                        <i className="fas fa-times-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.failedPayments}</h3>
                        <p>Failed</p>
                    </div>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search by student, email, course, or transaction ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="filter-controls">
                    <select 
                        className="status-filter"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                    </select>
                    
                    <select 
                        className="date-filter"
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                    >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                    </select>
                    
                    <button className="refresh-btn" onClick={fetchPayments}>
                        <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            </div>

            {/* Payments Table */}
            <div
                ref={tableContainerRef}
                className={`payments-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table className="payments-table">
                    <colgroup>
                        {COLUMN_DEFS.map((key, idx) => (
                            <col key={key} style={{ width: `${columnWidths[idx]}px` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-cell">
                                <input
                                    type="checkbox"
                                    checked={sortedPayments.length > 0 && selectedPayments.length === sortedPayments.length}
                                    onChange={toggleAllPayments}
                                />
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 0)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(0); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('transactionId')}>
                                Transaction ID
                                {sortBy === 'transactionId' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 1)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(1); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('student')}>
                                Student
                                {sortBy === 'student' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 2)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(2); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('course')}>
                                Course
                                {sortBy === 'course' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 3)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(3); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('amount')}>
                                Amount
                                {sortBy === 'amount' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 4)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(4); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('email')}>
                                Email
                                {sortBy === 'email' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 5)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(5); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('status')}>
                                Status
                                {sortBy === 'status' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 6)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(6); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('method')}>
                                Method
                                {sortBy === 'method' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 7)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(7); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('date')}>
                                Date & Time
                                {sortBy === 'date' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 8)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(8); }} />
                            </th>
                            <th>
                                Actions
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 9)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(9); }} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedPayments.map((payment) => (
                            <tr key={payment._id} className={selectedPayments.includes(payment._id) ? 'selected' : ''}>
                                <td className="checkbox-cell">
                                    <input
                                        type="checkbox"
                                        checked={selectedPayments.includes(payment._id)}
                                        onChange={() => togglePaymentSelection(payment._id)}
                                    />
                                </td>
                                <td>
                                    <div className="transaction-id">
                                        <i className="fas fa-receipt"></i>
                                        <code>{payment.transactionId}</code>
                                    </div>
                                </td>
                                <td>
                                    <div className="student-info">
                                        <div className="student-avatar">
                                            {(payment.user?.name || payment.studentName || 'U').charAt(0)}
                                        </div>
                                        <div className="student-details">
                                            <strong>{payment.user?.name || payment.studentName || 'Unknown'}</strong>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className="course-info">
                                        <i className="fas fa-book"></i>
                                        {payment.course?.title || payment.courseName || 'Unknown Course'}
                                    </div>
                                </td>
                                <td>
                                    <span className="amount-badge">
                                        <strong>${payment.amount.toFixed(2)}</strong>
                                        <small>{payment.currency}</small>
                                    </span>
                                </td>
                                <td>
                                    {payment.user?.email || payment.email || 'No email'}
                                </td>
                                <td>
                                    <span className={`status-badge ${payment.status}`}>
                                        <i className={`fas fa-${getStatusIcon(payment.status)}`}></i>
                                        {payment.status}
                                    </span>
                                </td>
                                <td>
                                    <span className={`method-badge ${payment.paymentMethod}`}>
                                        <i className={`fab fa-${payment.paymentMethod}`}></i>
                                        {payment.paymentMethod}
                                    </span>
                                </td>
                                <td>
                                    {new Date(payment.createdAt).toLocaleString()}
                                </td>
                                <td>
                                    <div className="action-buttons">
                                        <button 
                                            className="action-btn view-btn"
                                            title="View Details"
                                            onClick={() => alert(`Payment Details:\n\nTransaction: ${payment.transactionId}\nAmount: $${payment.amount}\nStatus: ${payment.status}\nDate: ${new Date(payment.createdAt).toLocaleString()}`)}
                                        >
                                            <i className="fas fa-eye"></i>
                                        </button>
                                        {payment.status === 'completed' && (
                                            <button 
                                                className="action-btn refund-btn"
                                                title="Issue Refund"
                                                onClick={() => handleRefund(payment._id)}
                                            >
                                                <i className="fas fa-undo"></i>
                                            </button>
                                        )}
                                        <button 
                                            className="action-btn invoice-btn"
                                            title="Download Invoice"
                                            onClick={() => alert('Invoice download feature coming soon!')}
                                        >
                                            <i className="fas fa-file-invoice"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {sortedPayments.length === 0 && (
                    <div className="no-results">
                        <i className="fas fa-credit-card"></i>
                        <h3>No payments found</h3>
                        <p>Try a different search term or filter</p>
                    </div>
                )}
            </div>

            {/* Summary Footer */}
            <div className="summary-footer">
                <div className="summary-item">
                    <span className="summary-label">Showing</span>
                    <span className="summary-value">{filteredPayments.length} of {payments.length} payments</span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Filtered Revenue</span>
                    <span className="summary-value">
                        ${filteredPayments
                            .filter(p => p.status === 'completed')
                            .reduce((sum, p) => sum + p.amount, 0)
                            .toFixed(2)}
                    </span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Last Updated</span>
                    <span className="summary-value">{new Date().toLocaleTimeString()}</span>
                </div>
            </div>
        </div>
    );
};

// Helper function for status icons
const getStatusIcon = (status) => {
    switch(status) {
        case 'completed': return 'check-circle';
        case 'pending': return 'clock';
        case 'failed': return 'times-circle';
        case 'refunded': return 'undo';
        default: return 'question-circle';
    }
};

export default PaymentsManagement;