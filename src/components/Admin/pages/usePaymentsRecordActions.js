import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { paymentRegistrationEmail } from '../../../utils/studentPortalEmail';
import { joinAdminErrors, getAdminErrorMessage } from '../../../utils/adminApi';
import {
    QUARANTINE_LABEL,
    MOVED_TO_QUARANTINE_PHRASE,
    FAILED_MOVE_TO_QUARANTINE_PHRASE,
} from '../../../utils/adminListLabels';
import {
    idsForPaymentRow,
    isPaymentPaid,
    formatPaymentStatus,
} from './paymentsManagementShared';
import { toDateInputValue, csvEscape } from './paymentsManagementConfig';

export function usePaymentsRecordActions({
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
}) {
    const togglePaymentSelection = (payment) => {
        const ids = idsForPaymentRow(payment);
        setSelectedPayments((prev) => {
            const allSelected = ids.every((id) => prev.includes(id));
            if (allSelected) return prev.filter((id) => !ids.includes(id));
            return [...new Set([...prev, ...ids])];
        });
    };

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
            currency: payment.currency || 'USD',
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

    return {
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
    };
}
