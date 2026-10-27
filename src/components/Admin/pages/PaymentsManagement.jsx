import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PaymentsManagementView } from './PaymentsManagementView';
import { usePaymentsRecordActions } from './usePaymentsRecordActions';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { useAdminDialog } from '../AdminDialogContext';
import { markPortalPageVisited, ADMIN_SEEN_PAYMENTS } from '../../../utils/portalNewItems';
import './PaymentsManagement.scss';
import {
    idsForPaymentRow,
    isPaymentPaid,
} from './paymentsManagementShared';
import {
    COLUMN_MIN_WIDTHS,
    TXN_COL_INDEX,
    MOBILE_PORTRAIT_QUERY,
    isMobilePortraitViewport,
    txnColumnWidth,
    DEFAULT_COLUMN_WIDTHS,
    COLUMN_MAX_WIDTHS,
    clamp,
    PAYMENTS_PAGE_SIZE,
    groupPaymentsForAdminTable,
    EMPTY_BANK_FORM,
    bankDetailsToForm,
} from './paymentsManagementConfig';

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
        revenueByCurrency: [],
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

    const calculateStats = (paymentData) => {
        const stats = {
            revenueByCurrency: [],
            successfulPayments: 0,
            pendingPayments: 0,
            failedPayments: 0,
            refundedPayments: 0,
        };
        const revenueByCode = new Map();

        paymentData.forEach(payment => {
            if (isPaymentPaid(payment.status)) {
                const code = String(payment.currency || 'USD').toUpperCase();
                revenueByCode.set(code, (revenueByCode.get(code) || 0) + Number(payment.amount || 0));
                stats.successfulPayments++;
            } else if (payment.status === 'pending') {
                stats.pendingPayments++;
            } else if (payment.status === 'failed') {
                stats.failedPayments++;
            } else if (payment.status === 'refunded') {
                stats.refundedPayments++;
            }
        });
        stats.revenueByCurrency = [...revenueByCode.entries()]
            .map(([currency, total]) => ({ currency, total }))
            .filter((row) => row.total !== 0);

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

    const {
        togglePaymentSelection,
        toggleAllPayments,
        handleDeleteSelectedPayments,
        handleRestorePayment,
        handleRestoreSelected,
        handlePermanentDelete,
        handlePermanentDeleteSelected,
        handleSendInvoiceEmail,
        handleInvoiceButtonClick,
        downloadCombinedFromPicker,
        downloadSeparateFromPicker,
        handleRefundPayment,
        handleMarkReceived,
        submitReceive,
        handleDeclinePayment,
        submitDecline,
        handleExtendDueDate,
        submitDueDate,
        handleDeletePayment,
        exportPayments,
        onStatCardKeyDown,
    } = usePaymentsRecordActions({
        setSelectedPayments,
        paginatedPayments,
        selectedPayments,
        listTab,
        showConfirm,
        fetchPayments,
        showAlert,
        trashBusy,
        setTrashBusy,
        setInvoicePicker,
        invoicePicker,
        setReceiveModal,
        receiveModal,
        setDeclineModal,
        declineModal,
        setDueDateModal,
        dueDateModal,
        totalPayments,
        payments,
        setFilterStatus,
    });

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
