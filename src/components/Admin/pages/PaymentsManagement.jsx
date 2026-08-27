import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import { paymentRegistrationEmail } from '../../../utils/studentPortalEmail';
import { useAdminDialog } from '../AdminDialogContext';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import './PaymentsManagement.scss';

const isPaymentPaid = (status) => status === 'paid' || status === 'completed';

const formatPaymentStatus = (status) => {
    if (status === 'completed') return 'paid';
    if (status === 'awaiting_review') return 'awaiting review';
    return status || '—';
};

const canOpenStudentFromPayment = (payment) => {
    if (!isPaymentPaid(payment.status)) return false;
    if (payment.paymentMethod === 'bank' && !payment.proofUrl) return false;
    return !!(payment.email || payment.user?.email);
};

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
const DEFAULT_COLUMN_WIDTHS = [60, 132, 200, 200, 120, 200, 130, 110, 110, 170, 1];
const COLUMN_MIN_WIDTHS = [50, 88, 140, 140, 90, 140, 96, 100, 100, 130, 90];
const COLUMN_MAX_WIDTHS = [90, 280, 360, 360, 220, 420, 220, 220, 220, 320, 280];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const PAYMENTS_PAGE_SIZE = 25;

const csvEscape = (value) => {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

const EMPTY_BANK_FORM = {
    bankAccountName: '',
    bankName: '',
    bankAccountNumber: '',
    bankIban: '',
    bankSwift: '',
    bankExtraNote: '',
};

const bankDetailsToForm = (details = {}) => ({
    bankAccountName: details.accountName || '',
    bankName: details.bankName || '',
    bankAccountNumber: details.accountNumber || '',
    bankIban: details.iban || '',
    bankSwift: details.swift || '',
    bankExtraNote: details.extraNote || '',
});

const PaymentsManagement = () => {
    const { showAlert, showConfirm } = useAdminDialog();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const hasLoadedOnceRef = useRef(false);
    const [lastFetchedAt, setLastFetchedAt] = useState(null);
    const [page, setPage] = useState(1);
    const [totalPayments, setTotalPayments] = useState(0);
    const [fetchError, setFetchError] = useState('');
    const [bankForm, setBankForm] = useState(EMPTY_BANK_FORM);
    const [bankConfigOpen, setBankConfigOpen] = useState(false);
    const [listTab, setListTab] = useState('active');
    const [trashCount, setTrashCount] = useState(0);
    const [trashBusy, setTrashBusy] = useState(false);
    const [bankSaving, setBankSaving] = useState(false);
    const [bankMessage, setBankMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [receiptModal, setReceiptModal] = useState(null);
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

    const fetchBankDetails = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/payments/bank-details`);
            if (response.data?.success) {
                setBankForm(bankDetailsToForm(response.data.bankDetails));
            }
        } catch (error) {
            console.error('Error fetching bank details:', error);
        }
    }, []);

    const saveBankDetails = async () => {
        setBankSaving(true);
        setBankMessage('');
        try {
            const token = getAuthToken();
            const response = await axios.put(`${API_BASE_URL}/api/payments/admin/bank-details`, bankForm, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.data?.success) {
                throw new Error(response.data?.error || 'Failed to save');
            }
            setBankForm(bankDetailsToForm(response.data.bankDetails));
            setBankMessage('Bank transfer details saved.');
        } catch (error) {
            const msg = error.response?.data?.error || error.message || 'Failed to save bank details';
            setBankMessage(msg);
            await showAlert(msg, 'error');
        } finally {
            setBankSaving(false);
        }
    };

    const fetchPayments = useCallback(async ({ soft = false, page: pageOverride } = {}) => {
        if (!soft && !hasLoadedOnceRef.current) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setFetchError('');

        try {
            const token = getAuthToken();
            const effectivePage = pageOverride ?? page;
            const response = await axios.get(`${API_BASE_URL}/api/payments`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    page: effectivePage,
                    limit: PAYMENTS_PAGE_SIZE,
                    search: searchTerm.trim() || undefined,
                    status: filterStatus !== 'all' ? filterStatus : undefined,
                    dateRange: dateRange !== 'all' ? dateRange : undefined,
                    sortBy,
                    sortOrder,
                    ...(listTab === 'trash' ? { trash: '1' } : {}),
                    includeCounts: 1,
                    includeStats: listTab === 'active' ? 1 : 0,
                },
            });
            const fetchedPayments = Array.isArray(response.data.payments) ? response.data.payments : [];
            setPayments(fetchedPayments);
            setTotalPayments(Number(response.data.total) || fetchedPayments.length);
            if (typeof response.data.trashCount === 'number') {
                setTrashCount(response.data.trashCount);
            }
            if (response.data.stats && listTab === 'active') {
                setStats(response.data.stats);
            } else if (listTab === 'active') {
                calculateStats(fetchedPayments);
            }
            hasLoadedOnceRef.current = true;
            setLastFetchedAt(new Date());
        } catch (err) {
            setPayments([]);
            setTotalPayments(0);
            if (listTab === 'active') calculateStats([]);
            if (err.response?.status === 401) {
                window.location.assign('/admin/login');
                return;
            }
            setFetchError(err.response?.data?.error || err.message || 'Failed to load payments.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [listTab, page, searchTerm, filterStatus, dateRange, sortBy, sortOrder]);

    useEffect(() => {
        fetchPayments();
        fetchBankDetails();
    }, [fetchPayments, fetchBankDetails]);

    useEffect(() => {
        setSelectedPayments([]);
        setPage(1);
        if (listTab === 'trash') {
            setFilterStatus('all');
        }
    }, [listTab]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setPage(1);
            fetchPayments({ soft: true, page: 1 });
        }, 300);
        return () => window.clearTimeout(timer);
    }, [searchTerm, filterStatus, dateRange, sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (page !== 1 || hasLoadedOnceRef.current) {
            fetchPayments({ soft: true, page });
        }
    }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

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
            if (isPaymentPaid(payment.status)) {
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

    const sortedPayments = payments;

    const totalPages = Math.max(1, Math.ceil(totalPayments / PAYMENTS_PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const paginatedPayments = sortedPayments;

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const toggleAllPayments = () => {
        const visibleIds = paginatedPayments.map((payment) => payment._id);
        const allVisibleSelected = visibleIds.every((id) => selectedPayments.includes(id));
        if (visibleIds.length > 0 && allVisibleSelected) {
            setSelectedPayments((prev) => prev.filter((id) => !visibleIds.includes(id)));
        } else {
            setSelectedPayments((prev) => [...new Set([...prev, ...visibleIds])]);
        }
    };

    const handleDeleteSelectedPayments = async () => {
        if (!selectedPayments.length || listTab !== 'active') return;
        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `Move ${selectedPayments.length} selected payment record(s) to ${QUARANTINE_LABEL}? You can restore them from the ${QUARANTINE_LABEL} tab.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) return;

        const token = getAuthToken();
        const ids = [...selectedPayments];
        let moved = 0;

        await Promise.all(
            ids.map(async (paymentId) => {
                try {
                    await axios.delete(`${API_BASE_URL}/api/payments/${paymentId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    moved += 1;
                } catch (error) {
                    console.warn('Backend delete failed for payment:', paymentId, error);
                }
            })
        );

        setSelectedPayments([]);
        await fetchPayments();
        if (moved === ids.length) {
            showAlert(`${moved} payment record(s) moved to trash.`, 'success');
        } else if (moved > 0) {
            showAlert(`${moved} of ${ids.length} payment record(s) moved to trash.`, 'warning');
        } else {
            showAlert('Failed to move selected payments to trash.', 'error');
        }
    };

    const handleRestorePayment = async (paymentId) => {
        if (listTab !== 'trash' || trashBusy) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/payments/${paymentId}/restore`, null, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchPayments();
            showAlert('Payment restored.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to restore payment.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handleRestoreSelected = async () => {
        if (listTab !== 'trash' || !selectedPayments.length || trashBusy) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            const results = await Promise.allSettled(
                selectedPayments.map((id) =>
                    axios.patch(`${API_BASE_URL}/api/payments/${id}/restore`, null, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                )
            );
            const failed = results.filter((r) => r.status === 'rejected');
            setSelectedPayments([]);
            await fetchPayments({ soft: true });
            if (failed.length === 0) {
                showAlert('Selected payments restored.', 'success');
            } else if (failed.length < results.length) {
                showAlert(
                    `${results.length - failed.length} restored, ${failed.length} failed.`,
                    'warning'
                );
            } else {
                showAlert('Failed to restore selected payments.', 'error');
            }
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to restore payments.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handlePermanentDelete = async (paymentId) => {
        if (listTab !== 'trash' || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete permanently?',
            message: 'Are you sure? This payment cannot be restored later.',
            confirmLabel: 'Delete permanently',
            destructive: true,
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/payments/${paymentId}/permanent`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchPayments();
            showAlert('Payment permanently deleted.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to delete permanently.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handlePermanentDeleteSelected = async () => {
        if (listTab !== 'trash' || !selectedPayments.length || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete permanently?',
            message: `Are you sure you want to permanently delete ${selectedPayments.length} selected payment(s)? They cannot be restored later.`,
            confirmLabel: 'Delete permanently',
            destructive: true,
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            const results = await Promise.allSettled(
                selectedPayments.map((id) =>
                    axios.delete(`${API_BASE_URL}/api/payments/${id}/permanent`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                )
            );
            const failed = results.filter((r) => r.status === 'rejected');
            setSelectedPayments([]);
            await fetchPayments();
            if (failed.length === 0) {
                showAlert('Selected payments permanently deleted.', 'success');
            } else if (failed.length < results.length) {
                showAlert(
                    `${results.length - failed.length} deleted, ${failed.length} failed.`,
                    'warning'
                );
            } else {
                showAlert('Failed to delete selected payments.', 'error');
            }
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to delete permanently.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const selectedVisibleCount = paginatedPayments.filter((payment) => selectedPayments.includes(payment._id)).length;

    useEffect(() => {
        if (!selectAllRef.current) return;
        const isIndeterminate =
            paginatedPayments.length > 0 &&
            selectedVisibleCount > 0 &&
            selectedVisibleCount < paginatedPayments.length;
        selectAllRef.current.indeterminate = isIndeterminate;
    }, [selectedVisibleCount, paginatedPayments.length]);

    useEffect(() => {
        if (!receiptModal) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setReceiptModal(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [receiptModal]);

    const handleDeletePayment = async (paymentId) => {
        if (listTab !== 'active') return;
        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `Move this payment record to ${QUARANTINE_LABEL}? You can restore it from the ${QUARANTINE_LABEL} tab.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) return;

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/payments/${paymentId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSelectedPayments((prev) => prev.filter((id) => id !== paymentId));
            await fetchPayments();
            showAlert('Payment moved to trash.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to move payment to trash.', 'error');
        }
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
            ['Email', paymentRegistrationEmail(payment) || 'N/A'],
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

    const exportPayments = async () => {
        if (!totalPayments) {
            await showAlert('No payments to export. Adjust your search or filters.', 'warning');
            return;
        }

        const csvData = payments.map((p) => ({
            'Transaction ID': p.transactionId,
            Student: p.user?.name || p.studentName || 'Unknown',
            Email: paymentRegistrationEmail(p),
            Phone: p.phone || '',
            Course: p.course?.title || p.courseName || 'Unknown Course',
            Amount: `$${p.amount}`,
            Status: formatPaymentStatus(p.status),
            'Payment Method': p.paymentMethod,
            'Date & Time': new Date(p.createdAt).toLocaleString(),
        }));

        const headers = Object.keys(csvData[0]);
        const csvContent = [
            headers.map(csvEscape).join(','),
            ...csvData.map((row) => headers.map((key) => csvEscape(row[key])).join(',')),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payments_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const onStatCardKeyDown = (event, status) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setFilterStatus(status);
        }
    };

    if (loading && !lastFetchedAt && !fetchError) {
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
            {fetchError ? (
                <div className="admin-fetch-error" role="alert">{fetchError}</div>
            ) : null}
            {/* Header */}
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-credit-card"></i> Payment Management</h1>
                    <p>Monitor and manage all payment transactions</p>
                </div>
            </div>

            <div className="payments-list-tabs">
                <button
                    type="button"
                    className={`payments-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => setListTab('active')}
                >
                    <i className="fas fa-list" /> {ACTIVE_RECORDS_LABEL}
                </button>
                <button
                    type="button"
                    className={`payments-list-tab payments-list-tab--trash ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => setListTab('trash')}
                >
                    <i className="fas fa-archive" /> {QUARANTINE_LABEL}
                    {trashCount > 0 ? <span className="admin-list-tab-badge">{trashCount}</span> : null}
                </button>
            </div>

            {listTab === 'active' ? (
            <div className="payments-bank-config">
                <button
                    type="button"
                    className="payments-bank-config__toggle"
                    onClick={() => setBankConfigOpen((open) => !open)}
                    aria-expanded={bankConfigOpen}
                >
                    <span>
                        <i className="fas fa-university" /> Bank transfer details
                    </span>
                    <i className={`fas fa-chevron-${bankConfigOpen ? 'up' : 'down'}`} />
                </button>
                {bankConfigOpen ? (
                    <div className="payments-bank-config__body">
                        <p className="payments-bank-config__lead">
                            Shown to users on the course registration page when they choose bank transfer. Stripe
                            checkout uses your server <code>STRIPE_SECRET_KEY</code> (unchanged).
                        </p>
                        <div className="payments-bank-config__grid">
                            <div className="form-group">
                                <label>Account holder name</label>
                                <input
                                    type="text"
                                    value={bankForm.bankAccountName}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankAccountName: e.target.value }))}
                                    placeholder="Gorythm Academy"
                                />
                            </div>
                            <div className="form-group">
                                <label>Bank name</label>
                                <input
                                    type="text"
                                    value={bankForm.bankName}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankName: e.target.value }))}
                                    placeholder="Bank name"
                                />
                            </div>
                            <div className="form-group">
                                <label>Account number</label>
                                <input
                                    type="text"
                                    value={bankForm.bankAccountNumber}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                                    placeholder="Account number"
                                />
                            </div>
                            <div className="form-group">
                                <label>IBAN</label>
                                <input
                                    type="text"
                                    value={bankForm.bankIban}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankIban: e.target.value }))}
                                    placeholder="IBAN"
                                />
                            </div>
                            <div className="form-group">
                                <label>SWIFT / BIC</label>
                                <input
                                    type="text"
                                    value={bankForm.bankSwift}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankSwift: e.target.value }))}
                                    placeholder="SWIFT code"
                                />
                            </div>
                            <div className="form-group form-group-wide">
                                <label>Extra note (optional)</label>
                                <textarea
                                    rows={2}
                                    value={bankForm.bankExtraNote}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankExtraNote: e.target.value }))}
                                    placeholder="e.g. Include the payment reference in the transfer description."
                                />
                            </div>
                        </div>
                        <div className="payments-bank-config__actions">
                            {bankMessage ? <span className="payments-bank-config__msg">{bankMessage}</span> : null}
                            <button
                                type="button"
                                className="btn-primary btn-save"
                                onClick={saveBankDetails}
                                disabled={bankSaving}
                            >
                                <i className={`fas ${bankSaving ? 'fa-spinner fa-spin' : 'fa-save'}`} />{' '}
                                {bankSaving ? 'Saving…' : 'Save bank details'}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
            ) : null}

            {/* Stats Cards */}
            {listTab === 'active' ? (
            <div className="stats-grid">
                <div
                    className={`stat-card revenue ${filterStatus === 'paid' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('paid')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'paid')}
                    title="Show paid payments"
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
                    className={`stat-card success ${filterStatus === 'paid' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('paid')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'paid')}
                    title="Show paid payments"
                >
                    <div className="stat-icon success">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.successfulPayments}</h3>
                        <p>Paid</p>
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
            ) : null}

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
                        <option value="paid">Paid</option>
                        <option value="awaiting_review">Awaiting review</option>
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="rejected">Rejected</option>
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
                    
                    <button
                        className={`refresh-btn ${refreshing ? 'is-refreshing' : ''}`}
                        onClick={() => fetchPayments({ soft: true })}
                        disabled={refreshing}
                        type="button"
                        title="Refresh"
                        aria-label="Refresh"
                    >
                        <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
                    </button>
                    <button type="button" className="btn-secondary download-btn" onClick={exportPayments}>
                        <i className="fas fa-file-export"></i> Download CSV
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
                        {listTab === 'active' ? (
                            <button
                                type="button"
                                className="bulk-btn delete-btn"
                                onClick={handleDeleteSelectedPayments}
                            >
                                <i className="fas fa-archive"></i> Move to {QUARANTINE_LABEL}
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="bulk-btn restore-btn"
                                    onClick={handleRestoreSelected}
                                    disabled={trashBusy}
                                >
                                    <i className="fas fa-undo" /> Restore selected
                                </button>
                                <button
                                    type="button"
                                    className="bulk-btn delete-btn"
                                    onClick={handlePermanentDeleteSelected}
                                    disabled={trashBusy}
                                >
                                    <i className="fas fa-trash-alt" /> Delete permanently
                                </button>
                            </>
                        )}
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
                            <col
                                key={key}
                                style={
                                    key === 'actions'
                                        ? { width: '1%' }
                                        : { width: `${columnWidths[idx]}px` }
                                }
                            />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-cell">
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={paginatedPayments.length > 0 && selectedVisibleCount === paginatedPayments.length}
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
                            <th className="action-col">
                                Actions
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 10)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(10); }} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedPayments.map((payment) => (
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
                                    <span className="admin-email">
                                        {paymentRegistrationEmail(payment) || 'No email'}
                                    </span>
                                </td>
                                <td className="phone-cell">{payment.phone || '—'}</td>
                                <td>
                                    <span className={`status-badge ${payment.status === 'completed' ? 'paid' : payment.status}`}>
                                        <i className={`fas fa-${getStatusIcon(payment.status)}`}></i>
                                        {formatPaymentStatus(payment.status)}
                                    </span>
                                    {payment.failureReason ? (
                                        <div className="payment-failure-reason" title={payment.failureReason}>
                                            {payment.failureReason}
                                        </div>
                                    ) : null}
                                </td>
                                <td>
                                    <span className={`method-badge ${methodBadgeClass(payment.paymentMethod)}`}>
                                        <i className={methodIconClass(payment.paymentMethod)}></i>
                                        {payment.paymentMethod}
                                    </span>
                                </td>
                                <td>
                                    {listTab === 'trash'
                                        ? payment.deletedAt
                                            ? new Date(payment.deletedAt).toLocaleString()
                                            : '—'
                                        : new Date(payment.createdAt).toLocaleString()}
                                </td>
                                <td className="action-col cell-actions">
                                    <div className="action-buttons">
                                        {listTab === 'active' ? (
                                            <>
                                                {payment.proofUrl ? (
                                                    <button
                                                        className="action-btn receipt-btn"
                                                        title="View receipt"
                                                        onClick={() => setReceiptModal(payment)}
                                                    >
                                                        <i className="fas fa-receipt"></i> Receipt
                                                    </button>
                                                ) : null}
                                                {canOpenStudentFromPayment(payment) ? (
                                                    <Link
                                                        className="action-btn students-btn"
                                                        title="Open in Students"
                                                        to={`/admin/students?email=${encodeURIComponent(paymentRegistrationEmail(payment) || '')}`}
                                                    >
                                                        <i className="fas fa-user-graduate"></i> Student
                                                    </Link>
                                                ) : null}
                                                <button
                                                    className="action-btn invoice-btn"
                                                    title="Download Invoice"
                                                    onClick={() => downloadInvoice(payment)}
                                                >
                                                    <i className="fas fa-file-invoice"></i> Invoice
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    title={`Move to ${QUARANTINE_LABEL}`}
                                                    onClick={() => handleDeletePayment(payment._id)}
                                                >
                                                    <i className="fas fa-trash"></i> Delete
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="action-btn restore-btn"
                                                    title="Restore"
                                                    disabled={trashBusy}
                                                    onClick={() => handleRestorePayment(payment._id)}
                                                >
                                                    <i className="fas fa-undo"></i> Restore
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    title="Delete permanently"
                                                    disabled={trashBusy}
                                                    onClick={() => handlePermanentDelete(payment._id)}
                                                >
                                                    <i className="fas fa-times-circle"></i> Delete forever
                                                </button>
                                            </>
                                        )}
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

            {sortedPayments.length > 0 ? (
                <div className="payments-pagination">
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={currentPage <= 1 || refreshing}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                        <i className="fas fa-chevron-left" /> Prev
                    </button>
                    <span className="payments-pagination__info">
                        Page {currentPage} of {totalPages} | {totalPayments} matching payment
                        {sortedPayments.length === 1 ? '' : 's'}
                    </span>
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={currentPage >= totalPages || refreshing}
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    >
                        Next <i className="fas fa-chevron-right" />
                    </button>
                </div>
            ) : null}

            {/* Summary Footer */}
            <div className="summary-footer">
                <div className="summary-item">
                    <span className="summary-label">Showing</span>
                    <span className="summary-value">{totalPayments} payment{totalPayments === 1 ? '' : 's'}</span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Filtered Revenue</span>
                    <span className="summary-value">
                        ${payments
                            .filter((p) => isPaymentPaid(p.status))
                            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
                            .toFixed(2)}
                    </span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Last Updated</span>
                    <span className="summary-value">
                        {lastFetchedAt ? lastFetchedAt.toLocaleString() : '—'}
                    </span>
                </div>
            </div>

            {receiptModal?.proofUrl ? (
                <div className="payment-receipt-modal" role="dialog" aria-modal="true">
                    <div className="payment-receipt-modal__backdrop" onClick={() => setReceiptModal(null)} />
                    <div className="payment-receipt-modal__panel">
                        <div className="payment-receipt-modal__head">
                            <h3>Payment receipt</h3>
                            <button type="button" className="payment-receipt-modal__close" onClick={() => setReceiptModal(null)}>
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <p>
                            {receiptModal.studentName || receiptModal.user?.name || 'Student'} —{' '}
                            {receiptModal.course?.title || receiptModal.courseName || 'Course'}
                        </p>
                        {String(receiptModal.proofUrl).toLowerCase().endsWith('.pdf') ? (
                            <a
                                href={resolveMediaUrl(receiptModal.proofUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="payment-receipt-modal__pdf-link"
                            >
                                <i className="fas fa-file-pdf" /> Open PDF receipt
                            </a>
                        ) : (
                            <img
                                src={resolveMediaUrl(receiptModal.proofUrl)}
                                alt="Payment proof"
                                className="payment-receipt-modal__image"
                            />
                        )}
                    </div>
                </div>
            ) : null}
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
        case 'paid':
        case 'completed': return 'check-circle';
        case 'awaiting_review': return 'hourglass-half';
        case 'pending': return 'clock';
        case 'rejected': return 'ban';
        case 'failed': return 'times-circle';
        case 'refunded': return 'undo';
        default: return 'question-circle';
    }
};

export default PaymentsManagement;