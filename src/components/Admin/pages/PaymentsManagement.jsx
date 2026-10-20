import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PaymentsManagementView } from './PaymentsManagementView';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { paymentRegistrationEmail } from '../../../utils/studentPortalEmail';
import { useAdminDialog } from '../AdminDialogContext';
import { getAdminErrorMessage, joinAdminErrors } from '../../../utils/adminApi';
import { QUARANTINE_LABEL, MOVED_TO_QUARANTINE_PHRASE, FAILED_MOVE_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import { markPortalPageVisited, ADMIN_SEEN_PAYMENTS } from '../../../utils/portalNewItems';
import './PaymentsManagement.scss';
import {
    formatPaymentStatus,
    idsForPaymentRow,
    isPaymentPaid,
} from './paymentsManagementShared';

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
    const [receiveModal, setReceiveModal] = useState(null);
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
            confirmLabel: 'Save Due Date',
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
        const failures = [];

        await Promise.all(
            ids.map(async (paymentId) => {
                try {
                    await axios.delete(`${API_BASE_URL}/api/payments/${paymentId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    moved += 1;
                } catch (error) {
                    failures.push(error);
                }
            })
        );

        setSelectedPayments([]);
        await fetchPayments();
        const reason = joinAdminErrors(failures);
        if (moved === ids.length) {
            showAlert(`${moved} payment record(s) ${MOVED_TO_QUARANTINE_PHRASE}.`, 'success');
        } else if (moved > 0) {
            showAlert(
                `${moved} of ${ids.length} payment record(s) ${MOVED_TO_QUARANTINE_PHRASE}.${reason ? ` ${reason}` : ''}`,
                'warning'
            );
        } else {
            showAlert(reason || `Failed to move selected payments to ${QUARANTINE_LABEL}.`, 'error');
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
            showAlert(getAdminErrorMessage(error, 'Failed to restore payment.'), 'error');
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
            const reason = joinAdminErrors(failed.map((r) => r.reason));
            setSelectedPayments([]);
            await fetchPayments({ soft: true });
            if (failed.length === 0) {
                showAlert('Selected payments restored.', 'success');
            } else if (failed.length < results.length) {
                showAlert(
                    `${results.length - failed.length} restored, ${failed.length} failed.${reason ? ` ${reason}` : ''}`,
                    'warning'
                );
            } else {
                showAlert(reason || 'Failed to restore selected payments.', 'error');
            }
        } catch (error) {
            showAlert(getAdminErrorMessage(error, 'Failed to restore payments.'), 'error');
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
            showAlert(getAdminErrorMessage(error, 'Failed to delete permanently.'), 'error');
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
            const reason = joinAdminErrors(failed.map((r) => r.reason));
            setSelectedPayments([]);
            await fetchPayments();
            if (failed.length === 0) {
                showAlert('Selected payments permanently deleted.', 'success');
            } else if (failed.length < results.length) {
                showAlert(
                    `${results.length - failed.length} deleted, ${failed.length} failed.${reason ? ` ${reason}` : ''}`,
                    'warning'
                );
            } else {
                showAlert(reason || 'Failed to delete selected payments.', 'error');
            }
        } catch (error) {
            showAlert(getAdminErrorMessage(error, 'Failed to delete permanently.'), 'error');
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
        if (!dueDateModal && !receiveModal && !declineModal && !proofModal && !invoicePicker) return undefined;
        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            if (dueDateModal && !dueDateModal.saving) setDueDateModal(null);
            if (receiveModal && !receiveModal.saving) setReceiveModal(null);
            if (declineModal && !declineModal.saving) setDeclineModal(null);
            if (proofModal) setProofModal(null);
            if (invoicePicker) setInvoicePicker(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [dueDateModal, receiveModal, declineModal, proofModal, invoicePicker]);

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

    const handleSendInvoiceEmail = async (payment) => {
        const paymentId = String(payment?._id || '');
        if (!paymentId) return;
        if (!isPaymentPaid(payment.status)) {
            showAlert('Mark the payment received before emailing the invoice.', 'warning');
            return;
        }
        const confirmed = await showConfirm({
            title: 'Email invoice?',
            message: payment.receiptSentAt
                ? 'This invoice email was sent before. Send it again to the student personal email?'
                : 'Send the fee confirmation email with PDF to the student personal email?',
            confirmLabel: payment.receiptSentAt ? 'Resend email' : 'Send email',
        });
        if (!confirmed) return;
        try {
            const token = getAuthToken();
            const response = await axios.post(
                `${API_BASE_URL}/api/payments/${paymentId}/send-receipt`,
                { force: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await fetchPayments({ soft: true, withStats: false });
            showAlert(response.data?.message || 'Invoice email sent.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || error.message || 'Failed to send invoice email', 'error');
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

    const handleMarkReceived = (payment) => {
        const singleBill = idsForPaymentRow(payment).length === 1 && (payment.lines?.length || 0) <= 1;
        const studentIds = new Set();
        const primaryId = payment.user?._id || payment.user?.id || payment.user;
        if (primaryId) studentIds.add(String(primaryId));
        for (const line of payment.lines || []) {
            const lineStudent = line.student?._id || line.student?.id || line.student;
            if (lineStudent) studentIds.add(String(lineStudent));
        }
        const studentCount = studentIds.size || 1;
        setReceiveModal({
            id: payment._id,
            label: payment.course?.title || payment.courseName || 'this bill',
            billed: Number(payment.amount || 0),
            amount: String(Number(payment.amount || 0)),
            partialAllowed: singleBill,
            studentCount,
            saving: false,
        });
    };

    const submitReceive = async () => {
        if (!receiveModal?.id) return;
        const billedCents = Math.round(receiveModal.billed * 100);
        const receivedCents = Math.round(Number(receiveModal.amount) * 100);
        const isPartial = receiveModal.partialAllowed && receivedCents !== billedCents;
        if (isPartial && (!Number.isFinite(receivedCents) || receivedCents <= 0 || receivedCents > billedCents)) {
            showAlert('Enter an amount greater than zero and not more than the bill.', 'error');
            return;
        }
        setReceiveModal((prev) => (prev ? { ...prev, saving: true } : prev));
        const ok = await runPaymentAction(
            receiveModal.id,
            'mark-received',
            isPartial ? { amount: receivedCents / 100 } : {}
        );
        if (ok) setReceiveModal(null);
        else setReceiveModal((prev) => (prev ? { ...prev, saving: false } : prev));
    };

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
        <PaymentsManagementView
            state={{
                bankConfigOpen,
                bankForm,
                bankMessage,
                bankSaving,
                columnWidths,
                currentPage,
                dateRange,
                declineModal,
                downloadCombinedFromPicker,
                downloadSeparateFromPicker,
                dueDateDefault,
                dueDateMessage,
                dueDateModal,
                receiveModal,
                setReceiveModal,
                submitReceive,
                dueDateSaving,
                exportPayments,
                fetchError,
                fetchPayments,
                filterStatus,
                handleDeclinePayment,
                handleDeletePayment,
                handleDeleteSelectedPayments,
                handleExtendDueDate,
                handleInvoiceButtonClick,
                handleSendInvoiceEmail,
                handleMarkReceived,
                handlePermanentDelete,
                handlePermanentDeleteSelected,
                handleRefundPayment,
                handleRestorePayment,
                handleRestoreSelected,
                handleSort,
                invoicePicker,
                isTableDragging,
                lastFetchedAt,
                listTab,
                onStatCardKeyDown,
                onTableDragScroll,
                paginatedPayments,
                payments,
                paymentsTableWidth,
                proofModal,
                refreshing,
                resetColumnWidth,
                saveBankDetails,
                saveDefaultDueDate,
                searchTerm,
                selectAllRef,
                selectedPayments,
                selectedVisibleCount,
                setBankConfigOpen,
                setBankForm,
                setDateRange,
                setDeclineModal,
                setDueDateDefault,
                setDueDateModal,
                setFilterStatus,
                setInvoicePicker,
                setListTab,
                setPage,
                setProofModal,
                setSearchTerm,
                setSelectedPayments,
                sortBy,
                sortOrder,
                startColumnResize,
                startTableDragScroll,
                stats,
                stopTableDragScroll,
                submitDecline,
                submitDueDate,
                tableContainerRef,
                toggleAllPayments,
                togglePaymentSelection,
                totalPages,
                totalPayments,
                trashBusy,
                trashCount,
            }}
        />
    );
};

export default PaymentsManagement;
