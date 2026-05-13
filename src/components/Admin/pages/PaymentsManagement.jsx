import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { useAdminDialog } from '../AdminDialogContext';
import './PaymentsManagement.scss';

const COLUMN_DEFS = [
    'checkbox',
    'transactionId',
    'student',
    'course',
    'amount',
    'email',
    'phone',
    'status',
    'method',
    'date',
    'actions',
];
const DEFAULT_COLUMN_WIDTHS = [60, 132, 200, 200, 120, 200, 130, 110, 110, 170, 140];
const COLUMN_MIN_WIDTHS = [50, 88, 140, 140, 90, 140, 96, 100, 100, 130, 120];
const COLUMN_MAX_WIDTHS = [90, 280, 360, 360, 220, 420, 220, 220, 220, 320, 260];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const PaymentsManagement = () => {
    const { showAlert, showConfirm } = useAdminDialog();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('completed');
    const [dateRange, setDateRange] = useState('all');
    const [stats, setStats] = useState({
        totalRevenue: 0,
        successfulPayments: 0,
        pendingPayments: 0,
        failedPayments: 0,
        refundedPayments: 0,
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
    const selectAllRef = useRef(null);

    const fetchPayments = useCallback(async () => {
        try {
            setLoading(true);

            // Try backend first
            try {
                const token = getAuthToken();
                const response = await axios.get(`${API_BASE_URL}/api/payments`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const fetchedPayments = Array.isArray(response.data.payments) ? response.data.payments : [];
                setPayments(fetchedPayments);
                calculateStats(fetchedPayments);
            } catch {
                setPayments([]);
                calculateStats([]);
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
            failedPayments: 0,
            refundedPayments: 0,
        };

        paymentData.forEach(payment => {
            if (payment.status === 'completed') {
                stats.totalRevenue += payment.amount;
                stats.successfulPayments++;
            } else if (payment.status === 'pending') {
                stats.pendingPayments++;
            } else if (payment.status === 'failed') {
                stats.failedPayments++;
            } else if (payment.status === 'refunded') {
                stats.refundedPayments++;
            }
        });

        setStats(stats);
    };

    const filteredPayments = payments.filter(payment => {
        const matchesSearch = 
            (payment.user?.name || payment.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (payment.user?.email || payment.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (payment.course?.title || payment.courseName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (payment.transactionId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (payment.phone || '').toLowerCase().includes(searchTerm.toLowerCase());
        
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

    useEffect(() => {
        const visibleIds = new Set(filteredPayments.map((payment) => payment._id));
        setSelectedPayments((prev) => {
            const next = prev.filter((id) => visibleIds.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [filteredPayments]);

    const sortedPayments = [...filteredPayments].sort((a, b) => {
        const mult = sortOrder === 'asc' ? 1 : -1;
        const getVal = (p, key) => {
            if (key === 'transactionId') return (p.transactionId || '').toLowerCase();
            if (key === 'student') return (p.user?.name || p.studentName || '').toLowerCase();
            if (key === 'course') return (p.course?.title || p.courseName || '').toLowerCase();
            if (key === 'amount') return Number(p.amount) || 0;
            if (key === 'email') return (p.user?.email || p.email || '').toLowerCase();
            if (key === 'phone') return (p.phone || '').toLowerCase();
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
        const allVisibleSelected = visibleIds.every((id) => selectedPayments.includes(id));
        if (visibleIds.length > 0 && allVisibleSelected) {
            setSelectedPayments([]);
        } else {
            setSelectedPayments(visibleIds);
        }
    };

    const handleDeleteSelectedPayments = async () => {
        if (!selectedPayments.length) return;
        const confirmed = await showConfirm({
            title: 'Delete Payments?',
            message: `Delete ${selectedPayments.length} selected payment record(s)? This action cannot be undone.`,
            confirmLabel: 'Delete Selected',
        });
        if (!confirmed) return;

        const token = getAuthToken();

        await Promise.all(
            selectedPayments.map(async (paymentId) => {
                try {
                    await axios.delete(`${API_BASE_URL}/api/payments/${paymentId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                } catch (error) {
                    console.warn('Backend delete failed for payment, removing locally instead:', paymentId, error);
                }
            })
        );

        setPayments((prev) => {
            const selectedSet = new Set(selectedPayments);
            const nextPayments = prev.filter((payment) => !selectedSet.has(payment._id));
            calculateStats(nextPayments);
            return nextPayments;
        });
        setSelectedPayments([]);
        showAlert(`${selectedPayments.length} payment record(s) deleted.`, 'success');
    };

    const selectedVisibleCount = sortedPayments.filter((payment) => selectedPayments.includes(payment._id)).length;

    useEffect(() => {
        if (!selectAllRef.current) return;
        const isIndeterminate =
            sortedPayments.length > 0 &&
            selectedVisibleCount > 0 &&
            selectedVisibleCount < sortedPayments.length;
        selectAllRef.current.indeterminate = isIndeterminate;
    }, [selectedVisibleCount, sortedPayments.length]);

    const handleDeletePayment = async (paymentId) => {
        const confirmed = await showConfirm({
            title: 'Delete Payment?',
            message: 'Delete this payment record? This action cannot be undone.',
            confirmLabel: 'Delete Payment',
        });
        if (!confirmed) return;

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/payments/${paymentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (error) {
            console.warn('Backend delete failed, removing locally instead:', error);
        }

        setPayments((prev) => {
            const nextPayments = prev.filter((payment) => payment._id !== paymentId);
            calculateStats(nextPayments);
            return nextPayments;
        });
        setSelectedPayments((prev) => prev.filter((id) => id !== paymentId));
        showAlert('Payment record deleted.', 'success');
    };

    const triggerDownload = (blob, fileName) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    };

    const downloadInvoice = async (payment) => {
        const safeTransactionId = (payment.transactionId || payment._id || 'invoice').replace(/[^a-zA-Z0-9-_]/g, '_');
        const fileName = `invoice_${safeTransactionId}.pdf`;

        try {
            const token = getAuthToken();
            const response = await axios.get(`${API_BASE_URL}/api/payments/${payment._id}/invoice`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            const contentType = response.headers['content-type'] || 'application/pdf';
            const extension = contentType.includes('pdf') ? 'pdf' : 'txt';
            triggerDownload(response.data, `invoice_${safeTransactionId}.${extension}`);
            return;
        } catch (error) {
            console.warn('Invoice endpoint unavailable, generating local invoice file instead:', error);
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const marginX = 14;
        let cursorY = 18;

        const rowHeight = 10;
        const leftColWidth = 55;
        const rightColWidth = pageWidth - (marginX * 2) - leftColWidth;
        const tableWidth = leftColWidth + rightColWidth;

        const invoiceRows = [
            ['Transaction ID', payment.transactionId || 'N/A'],
            ['Student', payment.user?.name || payment.studentName || 'Unknown'],
            ['Email', payment.user?.email || payment.email || 'N/A'],
            ['Phone', payment.phone || 'N/A'],
            ['Course', payment.course?.title || payment.courseName || 'Unknown Course'],
            ['Amount', `$${Number(payment.amount || 0).toFixed(2)} ${payment.currency || ''}`.trim()],
            ['Status', payment.status || 'N/A'],
            ['Payment Method', payment.paymentMethod || 'N/A'],
            ['Payment Date', payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'N/A'],
            ['Generated At', new Date().toLocaleString()]
        ];

        doc.setFontSize(17);
        doc.setFont('helvetica', 'bold');
        doc.text('Gorythm - Payment Invoice', marginX, cursorY);
        cursorY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Invoice #: ${safeTransactionId}`, marginX, cursorY);
        cursorY += 10;

        // Table header
        doc.setFillColor(243, 244, 246);
        doc.rect(marginX, cursorY, tableWidth, rowHeight, 'F');
        doc.rect(marginX, cursorY, leftColWidth, rowHeight);
        doc.rect(marginX + leftColWidth, cursorY, rightColWidth, rowHeight);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Field', marginX + 2, cursorY + 6.5);
        doc.text('Value', marginX + leftColWidth + 2, cursorY + 6.5);
        cursorY += rowHeight;

        // Table body
        invoiceRows.forEach(([label, value], idx) => {
            if (idx % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(marginX, cursorY, tableWidth, rowHeight, 'F');
            }

            doc.rect(marginX, cursorY, leftColWidth, rowHeight);
            doc.rect(marginX + leftColWidth, cursorY, rightColWidth, rowHeight);
            doc.setFont('helvetica', 'bold');
            doc.text(String(label), marginX + 2, cursorY + 6.5);
            doc.setFont('helvetica', 'normal');

            const wrappedValue = doc.splitTextToSize(String(value), rightColWidth - 4);
            doc.text(wrappedValue, marginX + leftColWidth + 2, cursorY + 6.5);

            const dynamicRowHeight = Math.max(rowHeight, (wrappedValue.length * 5) + 3);
            if (dynamicRowHeight > rowHeight) {
                doc.rect(marginX, cursorY, leftColWidth, dynamicRowHeight);
                doc.rect(marginX + leftColWidth, cursorY, rightColWidth, dynamicRowHeight);
            }

            cursorY += dynamicRowHeight;
        });

        doc.save(fileName);
    };

    const exportPayments = () => {
        if (!filteredPayments.length) return;

        const csvData = filteredPayments.map((p) => ({
            'Transaction ID': p.transactionId,
            Student: p.user?.name || p.studentName || 'Unknown',
            Email: p.user?.email || p.email || '',
            Phone: p.phone || '',
            Course: p.course?.title || p.courseName || 'Unknown Course',
            Amount: `$${p.amount}`,
            Status: p.status,
            'Payment Method': p.paymentMethod,
            'Date & Time': new Date(p.createdAt).toLocaleString(),
        }));

        const csvContent = [
            Object.keys(csvData[0]).join(','),
            ...csvData.map((row) => Object.values(row).join(',')),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payments_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const onStatCardKeyDown = (event, status) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setFilterStatus(status);
        }
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
                <div
                    className={`stat-card revenue ${filterStatus === 'all' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('all')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'all')}
                    title="Show all payments"
                >
                    <div className="stat-icon revenue">
                        <i className="fas fa-dollar-sign"></i>
                    </div>
                    <div className="stat-info">
                        <h3>${stats.totalRevenue.toFixed(2)}</h3>
                        <p>Total Revenue</p>
                    </div>
                </div>
                <div
                    className={`stat-card success ${filterStatus === 'completed' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('completed')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'completed')}
                    title="Show successful payments"
                >
                    <div className="stat-icon success">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.successfulPayments}</h3>
                        <p>Successful</p>
                    </div>
                </div>
                <div
                    className={`stat-card pending ${filterStatus === 'pending' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('pending')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'pending')}
                    title="Show pending payments"
                >
                    <div className="stat-icon pending">
                        <i className="fas fa-clock"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.pendingPayments}</h3>
                        <p>Pending</p>
                    </div>
                </div>
                <div
                    className={`stat-card failed ${filterStatus === 'failed' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('failed')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'failed')}
                    title="Show failed payments"
                >
                    <div className="stat-icon failed">
                        <i className="fas fa-times-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.failedPayments}</h3>
                        <p>Failed</p>
                    </div>
                </div>
                <div
                    className={`stat-card refunded ${filterStatus === 'refunded' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('refunded')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'refunded')}
                    title="Show refunded payments"
                >
                    <div className="stat-icon refunded">
                        <i className="fas fa-undo"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.refundedPayments}</h3>
                        <p>Refunded</p>
                    </div>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search by student, email, phone, course, or transaction ID..."
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

            {selectedPayments.length > 0 && (
                <div className="selection-action-bar">
                    <div className="selection-info">
                        <i className="fas fa-check-square"></i>
                        <span>{selectedPayments.length} payment{selectedPayments.length > 1 ? 's' : ''} selected</span>
                    </div>
                    <div className="selection-actions">
                        <button
                            type="button"
                            className="bulk-btn clear-btn"
                            onClick={() => setSelectedPayments([])}
                        >
                            <i className="fas fa-times"></i> Clear selection
                        </button>
                        <button
                            type="button"
                            className="bulk-btn delete-btn"
                            onClick={handleDeleteSelectedPayments}
                        >
                            <i className="fas fa-trash"></i> Delete selected
                        </button>
                    </div>
                </div>
            )}

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
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={sortedPayments.length > 0 && selectedVisibleCount === sortedPayments.length}
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
                            <th className="sortable" onClick={() => handleSort('phone')}>
                                Phone
                                {sortBy === 'phone' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 6)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(6); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('status')}>
                                Status
                                {sortBy === 'status' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 7)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(7); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('method')}>
                                Method
                                {sortBy === 'method' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 8)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(8); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('date')}>
                                Date & Time
                                {sortBy === 'date' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 9)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(9); }} />
                            </th>
                            <th>
                                Actions
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 10)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(10); }} />
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
                                <td className="transaction-id-cell">
                                    <div
                                        className="transaction-id"
                                        title={payment.transactionId ? `Full ID: ${payment.transactionId}` : ''}
                                    >
                                        <i className="fas fa-receipt" aria-hidden />
                                        <code className="transaction-id-short">{shortenTxnId(payment.transactionId)}</code>
                                        {payment.transactionId ? (
                                            <button
                                                type="button"
                                                className="copy-txn-btn"
                                                title="Copy full transaction ID"
                                                aria-label="Copy full transaction ID"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(payment.transactionId);
                                                }}
                                            >
                                                <i className="fas fa-copy" aria-hidden />
                                            </button>
                                        ) : null}
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
                                        <strong>${Number(payment.amount || 0).toFixed(2)}</strong>
                                        <small>{payment.currency}</small>
                                    </span>
                                </td>
                                <td>
                                    {payment.user?.email || payment.email || 'No email'}
                                </td>
                                <td className="phone-cell">{payment.phone || '—'}</td>
                                <td>
                                    <span className={`status-badge ${payment.status}`}>
                                        <i className={`fas fa-${getStatusIcon(payment.status)}`}></i>
                                        {payment.status}
                                    </span>
                                </td>
                                <td>
                                    <span className={`method-badge ${methodBadgeClass(payment.paymentMethod)}`}>
                                        <i className={methodIconClass(payment.paymentMethod)}></i>
                                        {payment.paymentMethod}
                                    </span>
                                </td>
                                <td>
                                    {new Date(payment.createdAt).toLocaleString()}
                                </td>
                                <td>
                                    <div className="action-buttons">
                                        <button 
                                            className="action-btn invoice-btn"
                                            title="Download Invoice"
                                            onClick={() => downloadInvoice(payment)}
                                        >
                                            <i className="fas fa-file-invoice"></i>
                                        </button>
                                        <button
                                            className="action-btn delete-btn"
                                            title="Delete Payment"
                                            onClick={() => handleDeletePayment(payment._id)}
                                        >
                                            <i className="fas fa-trash"></i>
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

const shortenTxnId = (id) => {
    if (!id) return '—';
    const s = String(id);
    if (s.length <= 22) return s;
    return `${s.slice(0, 10)}…${s.slice(-8)}`;
};

const copyToClipboard = (text) => {
    if (!text) return;
    const t = String(text);
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(t).catch(() => {
            /* ignore */
        });
        return;
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    } catch {
        /* ignore */
    }
};

const methodBadgeClass = (method) => {
    const m = String(method || '').toLowerCase();
    if (m === 'card' || m === 'link') return 'stripe';
    return m.replace(/[^a-z0-9-]/g, '') || 'other';
};

const methodIconClass = (method) => {
    const m = String(method || '').toLowerCase();
    if (m === 'stripe' || m === 'card' || m === 'link') return 'fas fa-credit-card';
    if (m === 'bank') return 'fas fa-university';
    return 'fas fa-money-bill-wave';
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