import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { paymentRegistrationEmail } from '../../../utils/studentPortalEmail';
import { ProtectedFileFrame, ProtectedFileImage, ProtectedFileLink } from '../../../utils/fileUrl';
import { useAdminDialog } from '../AdminDialogContext';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_LABEL, MOVED_TO_QUARANTINE_PHRASE, FAILED_MOVE_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import { markPortalPageVisited, ADMIN_SEEN_PAYMENTS } from '../../../utils/portalNewItems';
import './PaymentsManagement.scss';

const isPaymentPaid = (status) => status === 'paid' || status === 'completed';

const formatPaymentStatus = (status, displayStatus) => {
    const key = displayStatus || status;
    if (key === 'completed' || key === 'paid') return 'Paid';
    if (key === 'awaiting_review' || key === 'processing') return 'Pending Verification';
    if (key === 'pending' || key === 'unpaid') return 'Unpaid';
    if (key === 'overdue') return 'Overdue';
    if (key === 'refunded') return 'Refunded';
    if (key === 'cancelled' || key === 'rejected') return 'Declined';
    return key || '—';
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
const COLUMN_MIN_WIDTHS = [50, 140, 140, 140, 90, 140, 96, 100, 100, 130, 90];
const TXN_COL_INDEX = 1;
// Phone portrait only (≤767px). 132px fits three Courier characters plus the ellipsis.
const MOBILE_PORTRAIT_QUERY = '(max-width: 767px) and (orientation: portrait)';
const TXN_WIDTH_MOBILE_PORTRAIT = 132;
const isMobilePortraitViewport = () => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_PORTRAIT_QUERY).matches
);
const txnColumnWidth = (mobilePortrait) => (
    mobilePortrait ? TXN_WIDTH_MOBILE_PORTRAIT : COLUMN_MIN_WIDTHS[TXN_COL_INDEX]
);
// Transaction ID starts at its narrowest. Widen the column to see the rest.
const DEFAULT_COLUMN_WIDTHS = [60, COLUMN_MIN_WIDTHS[TXN_COL_INDEX], 200, 200, 120, 200, 130, 110, 110, 170, 420];
const COLUMN_MAX_WIDTHS = [90, 960, 360, 360, 220, 420, 220, 220, 220, 320, 420];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const PAYMENTS_PAGE_SIZE = 25;

const toDateInputValue = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const checkoutGroupKey = (payment) => {
    if (payment?.groupId) return `group:${payment.groupId}`;
    if (payment?.stripePaymentIntentId) return `pi:${payment.stripePaymentIntentId}`;
    if (payment?.transactionId) return `txn:${payment.transactionId}`;
    return `id:${payment?._id}`;
};

const paymentAsLine = (payment) => ({
    studentName: payment.user?.name || payment.studentName || '',
    courseName: payment.course?.title || payment.courseName || 'Course',
    amount: payment.amount,
    course: payment.course,
    student: payment.user,
});

const refId = (value) => {
    if (!value) return '';
    if (typeof value === 'object') return String(value._id || value.id || '');
    return String(value);
};

const separateInvoiceTargets = (siblings, primary) => {
    const combined = siblings.length === 1 && (
        primary.invoiceMode === 'combined'
        || (Array.isArray(primary.lines) && primary.lines.length > 1)
    );
    if (combined) {
        const lines = Array.isArray(primary.lines) && primary.lines.length
            ? primary.lines
            : [paymentAsLine(primary)];
        return lines.map((line, index) => ({
            key: `${primary._id}-line-${index}`,
            label: line.courseName || primary.course?.title || 'Course',
            payment: primary,
            courseId: refId(line.course) || refId(primary.course),
            studentId: refId(line.student) || refId(primary.user),
            courseName: line.courseName || primary.course?.title || primary.courseName || '',
        }));
    }
    return siblings.map((row) => ({
        key: String(row._id),
        label: row.course?.title || row.courseName || row.lines?.[0]?.courseName || 'Invoice',
        payment: row,
        courseId: refId(row.lines?.[0]?.course) || refId(row.course),
        studentId: refId(row.lines?.[0]?.student) || refId(row.user),
        courseName: row.course?.title || row.courseName || row.lines?.[0]?.courseName || '',
    }));
};

const groupPaymentsForAdminTable = (payments) => {
    const buckets = new Map();
    for (const payment of payments || []) {
        const key = checkoutGroupKey(payment);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(payment);
    }
    return [...buckets.values()].map((siblings) => {
        const primary = siblings[0];
        const groupedPaymentIds = siblings.map((row) => row._id);
        const combined = siblings.length === 1 && (
            primary.invoiceMode === 'combined'
            || (Array.isArray(primary.lines) && primary.lines.length > 1)
        );
        const lines = siblings.flatMap((row) =>
            Array.isArray(row.lines) && row.lines.length
                ? row.lines.map((line) => ({ ...line, paymentId: row._id }))
                : [{ ...paymentAsLine(row), paymentId: row._id }]
        );
        const separateTargets = separateInvoiceTargets(siblings, primary);
        const invoiceButtons = [{
            key: `${primary._id}-invoice`,
            label: 'Invoice',
            payment: primary,
            multi: separateTargets.length > 1,
            separateTargets,
        }];
        if (siblings.length === 1 && combined) {
            return { ...primary, groupedPaymentIds, invoiceMode: 'combined', invoiceButtons, lines: primary.lines || lines };
        }
        if (siblings.length === 1) {
            return {
                ...primary,
                groupedPaymentIds,
                invoiceMode: primary.invoiceMode || 'separate',
                invoiceButtons,
            };
        }
        return {
            ...primary,
            amount: siblings.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            lines,
            groupedPaymentIds,
            invoiceMode: 'separate',
            invoiceButtons,
        };
    });
};

const idsForPaymentRow = (payment) =>
    (Array.isArray(payment.groupedPaymentIds) && payment.groupedPaymentIds.length
        ? payment.groupedPaymentIds
        : [payment._id]
    ).map(String);

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
    const [dueDateDefault, setDueDateDefault] = useState('');
    const [dueDateSaving, setDueDateSaving] = useState(false);
    const [dueDateMessage, setDueDateMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [dueDateModal, setDueDateModal] = useState(null);
    const [declineModal, setDeclineModal] = useState(null);
    const [proofModal, setProofModal] = useState(null);
    const [invoicePicker, setInvoicePicker] = useState(null);
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
    const [columnWidths, setColumnWidths] = useState(() => {
        const widths = [...DEFAULT_COLUMN_WIDTHS];
        widths[TXN_COL_INDEX] = txnColumnWidth(isMobilePortraitViewport());
        return widths;
    });
    const txnWidthIsAutomatic = useRef(true);
    const [sortBy, setSortBy] = useState('date');
    const [sortOrder, setSortOrder] = useState('desc');
    const [selectedPayments, setSelectedPayments] = useState([]);
    const selectAllRef = useRef(null);

    useEffect(() => {
        const media = window.matchMedia(MOBILE_PORTRAIT_QUERY);
        const applyTxnWidth = () => {
            if (!txnWidthIsAutomatic.current) return;
            const nextWidth = txnColumnWidth(media.matches);
            setColumnWidths((prev) => {
                if (prev[TXN_COL_INDEX] === nextWidth) return prev;
                const next = [...prev];
                next[TXN_COL_INDEX] = nextWidth;
                return next;
            });
        };
        applyTxnWidth();
        media.addEventListener('change', applyTxnWidth);
        return () => media.removeEventListener('change', applyTxnWidth);
    }, []);

    const fetchBankDetails = useCallback(async () => {
        try {
            const token = getAuthToken();
            const [bankRes, dueRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/payments/bank-details`),
                axios.get(`${API_BASE_URL}/api/payments/admin/fee-due-settings`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);
            if (bankRes.data?.success) {
                setBankForm(bankDetailsToForm(bankRes.data.bankDetails));
            }
            if (dueRes.data?.success) {
                setDueDateDefault(dueRes.data.defaultFeeDueDate || '');
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

    const saveDefaultDueDate = async () => {
        if (!dueDateDefault) {
            setDueDateMessage('Choose a due date first.');
            return;
        }
        const confirmed = await showConfirm({
            title: 'Replace due dates everywhere?',
            message: 'This replaces the due date on all active courses, all student enrollments that are not completed or cancelled, and the student and parent Fees pages. Course-specific and student-specific due dates will be overwritten.',
            confirmLabel: 'Save due date',
        });
        if (!confirmed) return;
        setDueDateSaving(true);
        setDueDateMessage('');
        try {
            const token = getAuthToken();
            const response = await axios.put(
                `${API_BASE_URL}/api/payments/admin/fee-due-settings`,
                { defaultFeeDueDate: dueDateDefault, confirm: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.data?.success) {
                throw new Error(response.data?.error || 'Failed to save');
            }
            setDueDateDefault(response.data.defaultFeeDueDate || dueDateDefault);
            setDueDateMessage('Default due date saved for all active courses.');
        } catch (error) {
            const msg = error.response?.data?.error || error.message || 'Failed to save due date';
            setDueDateMessage(msg);
            await showAlert(msg, 'error');
        } finally {
            setDueDateSaving(false);
        }
    };

    const fetchPayments = useCallback(async ({ soft = false, page: pageOverride, withStats } = {}) => {
        if (!soft && !hasLoadedOnceRef.current) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setFetchError('');

        try {
            const token = getAuthToken();
            const effectivePage = pageOverride ?? page;
            const includeStats = listTab === 'active' && (withStats ?? !soft);
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
                    includeStats: includeStats ? 1 : 0,
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
        markPortalPageVisited(ADMIN_SEEN_PAYMENTS);
    }, []);

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
        const minWidth = colIndex === TXN_COL_INDEX
            ? txnColumnWidth(isMobilePortraitViewport())
            : (COLUMN_MIN_WIDTHS[colIndex] ?? 80);
        if (colIndex === TXN_COL_INDEX) txnWidthIsAutomatic.current = false;
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
        if (colIndex === TXN_COL_INDEX) txnWidthIsAutomatic.current = true;
        setColumnWidths((prev) => {
            const next = [...prev];
            next[colIndex] = colIndex === TXN_COL_INDEX
                ? txnColumnWidth(isMobilePortraitViewport())
                : DEFAULT_COLUMN_WIDTHS[colIndex];
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

    const togglePaymentSelection = (payment) => {
        const ids = idsForPaymentRow(payment);
        setSelectedPayments((prev) => {
            const allSelected = ids.every((id) => prev.includes(id));
            if (allSelected) return prev.filter((id) => !ids.includes(id));
            return [...new Set([...prev, ...ids])];
        });
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

    const paginatedPayments = useMemo(() => groupPaymentsForAdminTable(payments), [payments]);

    const totalPages = Math.max(1, Math.ceil(totalPayments / PAYMENTS_PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const toggleAllPayments = () => {
        const visibleIds = paginatedPayments.flatMap((payment) => idsForPaymentRow(payment));
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
            showAlert(`${moved} payment record(s) ${MOVED_TO_QUARANTINE_PHRASE}.`, 'success');
        } else if (moved > 0) {
            showAlert(`${moved} of ${ids.length} payment record(s) ${MOVED_TO_QUARANTINE_PHRASE}.`, 'warning');
        } else {
            showAlert(`Failed to move selected payments to ${QUARANTINE_LABEL}.`, 'error');
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
            title: 'Delete Permanently?',
            message: 'Are you sure? This payment cannot be restored later.',
            confirmLabel: 'Delete Permanently',
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
            title: 'Delete Permanently?',
            message: `Are you sure you want to permanently delete ${selectedPayments.length} selected payment(s)? They cannot be restored later.`,
            confirmLabel: 'Delete Permanently',
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

    const selectedVisibleCount = paginatedPayments.filter((payment) =>
        idsForPaymentRow(payment).every((id) => selectedPayments.includes(id))
    ).length;

    useEffect(() => {
        if (!selectAllRef.current) return;
        const isIndeterminate =
            paginatedPayments.length > 0 &&
            selectedVisibleCount > 0 &&
            selectedVisibleCount < paginatedPayments.length;
        selectAllRef.current.indeterminate = isIndeterminate;
    }, [selectedVisibleCount, paginatedPayments.length]);

    useEffect(() => {
        if (!dueDateModal && !declineModal && !proofModal && !invoicePicker) return undefined;
        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            if (dueDateModal && !dueDateModal.saving) setDueDateModal(null);
            if (declineModal && !declineModal.saving) setDeclineModal(null);
            if (proofModal) setProofModal(null);
            if (invoicePicker) setInvoicePicker(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [dueDateModal, declineModal, proofModal, invoicePicker]);

    const runPaymentAction = async (paymentId, action, body = {}, confirm) => {
        if (confirm) {
            const ok = await showConfirm(confirm);
            if (!ok) return false;
        }
        try {
            const token = getAuthToken();
            const url = `${API_BASE_URL}/api/payments/${paymentId}/${action}`;
            if (action === 'due-date') {
                await axios.patch(url, body, { headers: { Authorization: `Bearer ${token}` } });
            } else {
                await axios.post(url, body, { headers: { Authorization: `Bearer ${token}` } });
            }
            await fetchPayments({ soft: true, withStats: false });
            showAlert('Updated.', 'success');
            return true;
        } catch (error) {
            showAlert(error.response?.data?.error || error.message || 'Action failed', 'error');
            return false;
        }
    };

    const downloadInvoice = async (payment, query = {}) => {
        try {
            const token = getAuthToken();
            const paymentId = String(payment?._id || payment?.id || '');
            const params = { kind: 'invoice' };
            if (query.scope) params.scope = query.scope;
            if (query.courseId && !String(query.courseId).includes('[object')) params.courseId = query.courseId;
            if (query.studentId && !String(query.studentId).includes('[object')) params.studentId = query.studentId;
            if (query.courseName) params.courseName = query.courseName;
            const response = await axios.get(`${API_BASE_URL}/api/payments/${paymentId}/invoice`, {
                headers: { Authorization: `Bearer ${token}` },
                params,
                responseType: 'blob',
            });
            const contentType = String(response.headers['content-type'] || '');
            if (contentType.includes('application/json')) {
                const text = await response.data.text();
                const parsed = JSON.parse(text);
                throw new Error(parsed.error || parsed.message || 'Could not download the invoice.');
            }
            const url = window.URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            const coursePart = String(query.courseName || '').replace(/[^a-zA-Z0-9-_]/g, '_');
            a.download = `invoice_${String(payment.invoiceNumber || payment.transactionId || paymentId).replace(/[^a-zA-Z0-9-_]/g, '_')}${coursePart ? `_${coursePart}` : ''}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            let message = error.response?.data?.error || error.message || 'Could not download the invoice.';
            const data = error.response?.data;
            if (typeof Blob !== 'undefined' && data instanceof Blob) {
                try {
                    const parsed = JSON.parse(await data.text());
                    message = parsed.error || parsed.message || message;
                } catch {
                    /* keep message */
                }
            }
            showAlert(message, 'error');
            throw error;
        }
    };

    const handleInvoiceButtonClick = (button) => {
        if (button?.multi) {
            setInvoicePicker(button);
            return;
        }
        const target = button?.separateTargets?.[0];
        downloadInvoice(target?.payment || button.payment, {
            courseId: target?.courseId,
            studentId: target?.studentId,
            courseName: target?.courseName,
        }).catch(() => {});
    };

    const downloadCombinedFromPicker = async () => {
        if (!invoicePicker) return;
        const picker = invoicePicker;
        setInvoicePicker(null);
        try {
            await downloadInvoice(picker.payment, { scope: 'combined' });
        } catch {
            /* alert already shown */
        }
    };

    const downloadSeparateFromPicker = async () => {
        if (!invoicePicker) return;
        const targets = invoicePicker.separateTargets || [];
        setInvoicePicker(null);
        const failed = [];
        for (const target of targets) {
            try {
                await downloadInvoice(target.payment, {
                    courseId: target.courseId,
                    studentId: target.studentId,
                    courseName: target.courseName,
                });
            } catch (err) {
                failed.push(`${target.label}: ${err?.message || 'download failed'}`);
            }
        }
        if (failed.length) {
            showAlert(
                failed.length === targets.length
                    ? `Could not download invoices. ${failed.join(' | ')}`
                    : `Some invoices did not download: ${failed.join(' | ')}`,
                'error'
            );
        }
    };

    const handleRefundPayment = (payment) =>
        runPaymentAction(payment._id, 'refund', {}, {
            title: 'Refund this payment?',
            message: payment.groupId
                ? 'This was part of a combined checkout. The full Stripe charge will be refunded.'
                : 'This will refund the Stripe charge if one exists, or mark a bank/manual payment as refunded.',
            confirmLabel: 'Refund',
        });

    const handleMarkReceived = (payment) =>
        runPaymentAction(payment._id, 'mark-received', {}, {
            title: 'Mark as received?',
            message: 'This marks the bill paid and enrolls the student(s). Use this for bank or cash payments.',
            confirmLabel: 'Mark received',
        });

    const handleDeclinePayment = (payment) => {
        setDeclineModal({
            id: payment._id,
            note: '',
            saving: false,
            label: payment.course?.title || payment.courseName || 'this bill',
        });
    };

    const submitDecline = async () => {
        if (!declineModal?.id) return;
        setDeclineModal((prev) => (prev ? { ...prev, saving: true } : prev));
        const ok = await runPaymentAction(declineModal.id, 'cancel', {
            reason: String(declineModal.note || '').trim(),
        });
        if (ok) setDeclineModal(null);
        else setDeclineModal((prev) => (prev ? { ...prev, saving: false } : prev));
    };

    const handleExtendDueDate = (payment) => {
        setDueDateModal({
            id: payment._id,
            date: toDateInputValue(payment.dueDate),
            saving: false,
            label: payment.course?.title || payment.courseName || 'this bill',
        });
    };

    const submitDueDate = async () => {
        if (!dueDateModal?.id || !dueDateModal.date) return;
        setDueDateModal((prev) => (prev ? { ...prev, saving: true } : prev));
        const ok = await runPaymentAction(dueDateModal.id, 'due-date', { dueDate: dueDateModal.date });
        if (ok) setDueDateModal(null);
        else setDueDateModal((prev) => (prev ? { ...prev, saving: false } : prev));
    };

    const handleDeletePayment = async (payment) => {
        if (listTab !== 'active') return;
        const ids = idsForPaymentRow(payment);
        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `Move this payment record to ${QUARANTINE_LABEL}? You can restore it from the ${QUARANTINE_LABEL} tab.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) return;

        try {
            const token = getAuthToken();
            await Promise.all(
                ids.map((paymentId) =>
                    axios.delete(`${API_BASE_URL}/api/payments/${paymentId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                )
            );
            setSelectedPayments((prev) => prev.filter((id) => !ids.includes(id)));
            await fetchPayments({ soft: true, withStats: false });
            showAlert(`Payment ${MOVED_TO_QUARANTINE_PHRASE}.`, 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || `${FAILED_MOVE_TO_QUARANTINE_PHRASE}.`, 'error');
        }
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

    const paymentsTableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

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
            <>
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
            <div className="payments-bank-config">
                <div className="payments-bank-config__body" style={{ display: 'block', padding: '1rem 1.25rem' }}>
                    <p className="payments-bank-config__lead">
                        Default fee due date for all courses. Student and parent Fees pages show this date. It is not
                        shown on the public website. Unpaid through this date; Overdue from the next day (Pakistan time).
                    </p>
                    <div className="payments-bank-config__grid">
                        <div className="form-group">
                            <label>Default due date</label>
                            <input
                                type="date"
                                value={dueDateDefault}
                                onChange={(e) => setDueDateDefault(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="payments-bank-config__actions">
                        {dueDateMessage ? <span className="payments-bank-config__msg">{dueDateMessage}</span> : null}
                        <button
                            type="button"
                            className="btn-primary btn-save"
                            onClick={saveDefaultDueDate}
                            disabled={dueDateSaving}
                        >
                            <i className={`fas ${dueDateSaving ? 'fa-spinner fa-spin' : 'fa-calendar-day'}`} />{' '}
                            {dueDateSaving ? 'Saving…' : 'Save default due date'}
                        </button>
                    </div>
                </div>
            </div>
            </>
            ) : null}
            {listTab === 'active' ? (
            <div className="stats-grid">
                <div
                    className={`stat-card revenue ${filterStatus === 'paid' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('paid')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'paid')}
                    title="Show Paid Payments"
                >
                    <div className="stat-icon revenue">
                        <i className="fas fa-dollar-sign"></i>
                    </div>
                    <div className="stat-info">
                        <h3>${Number(stats.totalRevenue || 0).toFixed(2)}</h3>
                        <p>Total Revenue</p>
                    </div>
                </div>
                <div
                    className={`stat-card success ${filterStatus === 'paid' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('paid')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'paid')}
                    title="Show Paid Payments"
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
                    title="Show Pending Payments"
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
                    title="Show Failed Payments"
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
                    title="Show Refunded Payments"
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
                        <option value="unpaid">Unpaid</option>
                        <option value="overdue">Overdue</option>
                        <option value="awaiting_review">Pending Verification</option>
                        <option value="paid">Paid</option>
                        <option value="refunded">Refunded</option>
                        <option value="cancelled">Declined</option>
                        <option value="failed">Failed</option>
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
                        onClick={() => fetchPayments({ soft: true, withStats: true })}
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
                                    <i className="fas fa-trash-alt" /> Delete Permanently
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
                <table
                    className="payments-table"
                    style={{
                        width: paymentsTableWidth,
                        minWidth: paymentsTableWidth,
                        '--payments-txn-width': `${columnWidths[1]}px`,
                    }}
                >
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
                                    checked={paginatedPayments.length > 0 && selectedVisibleCount === paginatedPayments.length}
                                    onChange={toggleAllPayments}
                                />
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 0)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(0); }} />
                            </th>
                            <th className="sortable transaction-id-head" onClick={() => handleSort('transactionId')}>
                                <span className="transaction-id-label">Transaction ID</span>
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
                        {paginatedPayments.map((payment) => {
                            const rowIds = idsForPaymentRow(payment);
                            const rowSelected = rowIds.every((id) => selectedPayments.includes(id));
                            return (
                            <tr key={payment._id} className={rowSelected ? 'selected' : ''}>
                                <td className="checkbox-cell">
                                    <input
                                        type="checkbox"
                                        checked={rowSelected}
                                        onChange={() => togglePaymentSelection(payment)}
                                    />
                                </td>
                                <td className="transaction-id-cell">
                                    <div
                                        className="transaction-id"
                                        title={paymentTableId(payment) ? `Full ID: ${paymentTableId(payment)}` : ''}
                                    >
                                        <i className="fas fa-receipt" aria-hidden />
                                        <code className="transaction-id-full" title={paymentTableId(payment)}>
                                            {paymentTableId(payment) || '—'}
                                        </code>
                                        {paymentTableId(payment) ? (
                                            <button
                                                type="button"
                                                className="copy-txn-btn"
                                                title="Copy full transaction ID"
                                                aria-label="Copy full transaction ID"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(paymentTableId(payment));
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
                                    {Array.isArray(payment.lines) && payment.lines.length > 1 ? (
                                        <ul className="payment-line-list">
                                            {payment.lines.map((line, index) => (
                                                <li key={`${payment._id}-line-${index}`}>
                                                    {line.studentName ? `${line.studentName} · ` : ''}
                                                    {line.courseName} · ${Number(line.amount || 0).toFixed(2)}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
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
                                    <span className={`status-badge ${payment.displayStatus === 'paid' || payment.status === 'completed' ? 'paid' : (payment.displayStatus || payment.status)}`}>
                                        <i className={`fas fa-${getStatusIcon(payment.displayStatus || payment.status)}`}></i>
                                        {formatPaymentStatus(payment.status, payment.displayStatus)}
                                    </span>
                                    {payment.displayStatus === 'overdue' && (payment.overdueSince || payment.dueDate) ? (
                                        <div className="payment-failure-reason">
                                            Overdue since {new Date(payment.overdueSince || payment.dueDate).toLocaleDateString()}
                                        </div>
                                    ) : !isPaymentPaid(payment.status) && payment.dueDate ? (
                                        <div className="payment-failure-reason">
                                            Due {new Date(payment.dueDate).toLocaleDateString()}
                                        </div>
                                    ) : null}
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
                                    {payment.cardLast4 ? (
                                        <div className="payment-failure-reason">
                                            {`${String(payment.cardBrand || 'Card').replace(/^./, (ch) => ch.toUpperCase())} •••• ${payment.cardLast4}`}
                                        </div>
                                    ) : null}
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
                                                        type="button"
                                                        title="View Payment Proof"
                                                        onClick={() => setProofModal(payment)}
                                                    >
                                                        <i className="fas fa-image"></i> Proof
                                                    </button>
                                                ) : null}
                                                {(payment.invoiceButtons || [{ key: payment._id, label: 'Invoice', payment }]).map((button) => (
                                                    <button
                                                        key={button.key}
                                                        className="action-btn invoice-btn"
                                                        type="button"
                                                        title="Download Invoice"
                                                        onClick={() => handleInvoiceButtonClick(button)}
                                                    >
                                                        <i className="fas fa-file-invoice"></i> Invoice
                                                    </button>
                                                ))}
                                                {canOpenStudentFromPayment(payment) ? (
                                                    <Link
                                                        className="action-btn students-btn"
                                                        title="Open in Students"
                                                        to={`/admin/students?email=${encodeURIComponent(paymentRegistrationEmail(payment) || '')}`}
                                                    >
                                                        <i className="fas fa-user-graduate"></i> Student
                                                    </Link>
                                                ) : null}
                                                {!isPaymentPaid(payment.status) && payment.status !== 'refunded' && payment.status !== 'cancelled' ? (
                                                    <>
                                                        <button className="action-btn students-btn" type="button" onClick={() => handleMarkReceived(payment)}>
                                                            Mark received
                                                        </button>
                                                        {payment.status !== 'awaiting_review' && payment.status !== 'processing' ? (
                                                            <button className="action-btn invoice-btn" type="button" onClick={() => handleExtendDueDate(payment)}>
                                                                Extend due date
                                                            </button>
                                                        ) : null}
                                                        <button className="action-btn delete-btn" type="button" onClick={() => handleDeclinePayment(payment)}>
                                                            Decline
                                                        </button>
                                                    </>
                                                ) : null}
                                                {isPaymentPaid(payment.status) ? (
                                                    <button className="action-btn restore-btn" type="button" onClick={() => handleRefundPayment(payment)}>
                                                        Refund
                                                    </button>
                                                ) : null}
                                                <button
                                                    className="action-btn delete-btn"
                                                    title={`Move to ${QUARANTINE_LABEL}`}
                                                    onClick={() => handleDeletePayment(payment)}
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
                                                    title="Delete Permanently"
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
                            );
                        })}
                    </tbody>
                </table>

                {payments.length === 0 && (
                    <div className="no-results">
                        <i className="fas fa-credit-card"></i>
                        <h3>No Payments Found</h3>
                        <p>Try a different search term or filter</p>
                    </div>
                )}
            </div>

            {payments.length > 0 ? (
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
                        {totalPayments === 1 ? '' : 's'}
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

            {invoicePicker ? (
                <div className="payment-invoice-picker" role="dialog" aria-modal="true" aria-labelledby="payment-invoice-picker-title">
                    <div
                        className="payment-invoice-picker__backdrop"
                        onClick={() => setInvoicePicker(null)}
                    />
                    <div className="payment-invoice-picker__panel">
                        <header className="payment-invoice-picker__head">
                            <h3 id="payment-invoice-picker-title">Download Invoice</h3>
                            <button
                                type="button"
                                className="payment-invoice-picker__close"
                                onClick={() => setInvoicePicker(null)}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </header>
                        <div className="payment-invoice-picker__body">
                            <p>
                                This row includes more than one course. Download one combined invoice, or a separate invoice for each course.
                            </p>
                            <div className="payment-invoice-picker__actions">
                                <button
                                    type="button"
                                    className="payment-invoice-picker__btn"
                                    onClick={downloadCombinedFromPicker}
                                >
                                    Combined invoice
                                </button>
                                <button
                                    type="button"
                                    className="payment-invoice-picker__btn"
                                    onClick={downloadSeparateFromPicker}
                                >
                                    Separate invoices
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {dueDateModal ? (
                <div className="payment-receipt-modal" role="dialog" aria-modal="true">
                    <div
                        className="payment-receipt-modal__backdrop"
                        onClick={() => !dueDateModal.saving && setDueDateModal(null)}
                    />
                    <div className="payment-receipt-modal__panel payment-due-modal">
                        <div className="payment-receipt-modal__head">
                            <h3>Extend due date</h3>
                            <button
                                type="button"
                                className="payment-receipt-modal__close"
                                onClick={() => !dueDateModal.saving && setDueDateModal(null)}
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <p>
                            Choose a later due date for {dueDateModal.label}. Unpaid stays Unpaid through this date.
                            Overdue starts the next day. To set the first due date, open Students → the student →
                            Edit course → Fee due date.
                        </p>
                        <label className="payment-due-modal__field">
                            Due date
                            <input
                                type="date"
                                value={dueDateModal.date || ''}
                                onChange={(e) => setDueDateModal((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                                disabled={dueDateModal.saving}
                            />
                        </label>
                        <div className="payment-due-modal__actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={dueDateModal.saving}
                                onClick={() => setDueDateModal(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary btn-add"
                                disabled={dueDateModal.saving || !dueDateModal.date}
                                onClick={submitDueDate}
                            >
                                {dueDateModal.saving ? 'Saving…' : 'Save due date'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {declineModal ? (
                <div className="payment-receipt-modal" role="dialog" aria-modal="true">
                    <div
                        className="payment-receipt-modal__backdrop"
                        onClick={() => !declineModal.saving && setDeclineModal(null)}
                    />
                    <div className="payment-receipt-modal__panel payment-due-modal">
                        <div className="payment-receipt-modal__head">
                            <h3>Decline this unpaid bill?</h3>
                            <button
                                type="button"
                                className="payment-receipt-modal__close"
                                onClick={() => !declineModal.saving && setDeclineModal(null)}
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <p>
                            Paid payments cannot be declined. Use refund for paid charges. A note here is shown on the student and parent Fees pages.
                        </p>
                        <label className="payment-due-modal__field">
                            Note for student / parent
                            <textarea
                                rows={4}
                                maxLength={500}
                                value={declineModal.note || ''}
                                onChange={(e) => setDeclineModal((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
                                disabled={declineModal.saving}
                                placeholder="Why this bill is declined"
                            />
                        </label>
                        <div className="payment-due-modal__actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={declineModal.saving}
                                onClick={() => setDeclineModal(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary btn-add"
                                disabled={declineModal.saving}
                                onClick={submitDecline}
                            >
                                {declineModal.saving ? 'Declining…' : 'Decline'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {proofModal?.proofUrl ? (
                <div className="payment-receipt-modal" role="dialog" aria-modal="true">
                    <div className="payment-receipt-modal__backdrop" onClick={() => setProofModal(null)} />
                    <div className="payment-receipt-modal__panel">
                        <div className="payment-receipt-modal__head">
                            <h3>Payment Proof</h3>
                            <button type="button" className="payment-receipt-modal__close" onClick={() => setProofModal(null)}>
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <p>
                            {proofModal.studentName || proofModal.user?.name || 'Student'} —{' '}
                            {proofModal.course?.title || proofModal.courseName || 'Course'}
                        </p>
                        {String(proofModal.proofUrl).toLowerCase().endsWith('.pdf') ? (
                            <ProtectedFileFrame
                                path={proofModal.proofUrl}
                                title="Payment Proof PDF"
                                className="payment-receipt-modal__image"
                            />
                        ) : (
                            <ProtectedFileImage
                                path={proofModal.proofUrl}
                                alt="Payment proof"
                                className="payment-receipt-modal__image"
                            />
                        )}
                        <ProtectedFileLink
                            path={proofModal.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="payment-receipt-modal__pdf-link"
                        >
                            <i className="fas fa-download" /> Download Proof
                        </ProtectedFileLink>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

const paymentTableId = (payment) => payment?.stripePaymentIntentId || payment?.transactionId || '';

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
        case 'overdue': return 'exclamation-circle';
        case 'unpaid':
        case 'pending': return 'clock';
        case 'cancelled':
        case 'rejected': return 'ban';
        case 'failed': return 'times-circle';
        case 'refunded': return 'undo';
        default: return 'question-circle';
    }
};

export default PaymentsManagement;