import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/constants';
import { getAuthUserJson } from '../../../utils/authStorage';
import { useCurrency } from '../../../context/CurrencyContext';
import './PaymentGateway.scss';

const BANK_STEPS = {
    FORM: 'form',
    INSTRUCTIONS: 'instructions',
    DONE: 'done',
};

const BANK_PAYMENT_SESSION_KEY = 'gorythm_bank_payment_session';

const readBankPaymentSession = () => {
    try {
        const raw = sessionStorage.getItem(BANK_PAYMENT_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?._id && parsed?.uploadToken) return parsed;
    } catch {
        /* ignore */
    }
    return null;
};

const writeBankPaymentSession = (payment) => {
    if (!payment?._id || !payment?.uploadToken) return;
    sessionStorage.setItem(BANK_PAYMENT_SESSION_KEY, JSON.stringify(payment));
};

const clearBankPaymentSession = () => {
    sessionStorage.removeItem(BANK_PAYMENT_SESSION_KEY);
};

function PaymentNoticeModal({ notice, onClose }) {
    if (!notice) return null;
    const iconClass =
        notice.type === 'error'
            ? 'fa-circle-exclamation'
            : notice.type === 'success'
              ? 'fa-circle-check'
              : 'fa-circle-info';

    return (
        <div className="payment-notice-modal" role="dialog" aria-modal="true">
            <div className="payment-notice-modal__backdrop" onClick={onClose} />
            <div className={`payment-notice-modal__panel payment-notice-modal__panel--${notice.type}`}>
                <div className="payment-notice-modal__icon" aria-hidden="true">
                    <i className={`fas ${iconClass}`} />
                </div>
                <h3>{notice.title}</h3>
                <p>{notice.message}</p>
                <button type="button" className="payment-notice-modal__btn" onClick={onClose}>
                    OK
                </button>
            </div>
        </div>
    );
}

const PaymentGateway = () => {
    const location = useLocation();
    const { currency, baseCurrency, formatFromUsd, rateDate } = useCurrency();
    const [paymentMethod, setPaymentMethod] = useState('stripe');
    const [courseOptions, setCourseOptions] = useState([]);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [bankDetails, setBankDetails] = useState(null);
    const [bankStep, setBankStep] = useState(BANK_STEPS.FORM);
    const [bankPayment, setBankPayment] = useState(null);
    const [proofFile, setProofFile] = useState(null);
    const [proofPreview, setProofPreview] = useState('');
    const [proofUploading, setProofUploading] = useState(false);
    const [bankSubmitting, setBankSubmitting] = useState(false);
    const proofInputRef = useRef(null);
    const successPanelRef = useRef(null);
    const [notice, setNotice] = useState(null);

    const showNotice = (title, message, type = 'info') => {
        setNotice({ title, message, type });
    };
    const [formData, setFormData] = useState({
        studentName: '',
        phone: '',
        email: '',
        courseName: '',
    });

    const paymentDetails = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const courseName = params.get('courseName') || '';
        const amount = params.get('amount') || '0';
        const feePlan = params.get('feePlan') || 'one-time';
        return { courseName, amount, feePlan };
    }, [location.search]);

    useEffect(() => {
        let cancelled = false;
        const fetchCourses = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/courses/public`);
                if (!response.ok) {
                    if (!cancelled) setCourseOptions([]);
                    return;
                }
                const data = await response.json();
                if (!cancelled) {
                    setCourseOptions(Array.isArray(data?.courses) ? data.courses : []);
                }
            } catch {
                if (!cancelled) setCourseOptions([]);
            }
        };

        fetchCourses();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const fetchBankDetails = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/payments/bank-details`);
                const data = await response.json();
                if (!cancelled && data.success) {
                    setBankDetails(data.bankDetails || null);
                }
            } catch {
                if (!cancelled) setBankDetails(null);
            }
        };
        fetchBankDetails();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        setFormData((prev) => ({
            ...prev,
            courseName: paymentDetails.courseName || prev.courseName || '',
        }));
    }, [paymentDetails.courseName]);

    useEffect(() => {
        const handlePageShow = () => {
            setCheckoutLoading(false);
        };
        window.addEventListener('pageshow', handlePageShow);
        return () => {
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, []);

    useEffect(() => {
        const saved = readBankPaymentSession();
        if (saved) {
            setBankPayment(saved);
            setBankStep(BANK_STEPS.INSTRUCTIONS);
        }
    }, []);

    useEffect(() => {
        if (paymentMethod !== 'bank') {
            setBankStep(BANK_STEPS.FORM);
            setBankPayment(null);
            setProofFile(null);
            setProofPreview('');
            clearBankPaymentSession();
        }
    }, [paymentMethod]);

    const selectedCourse = useMemo(
        () => courseOptions.find((course) => course?.title === formData.courseName) || null,
        [courseOptions, formData.courseName]
    );
    const resolvedAmount = Number(selectedCourse?.price ?? paymentDetails.amount) || 0;

    const paymentMethods = [
        {
            id: 'stripe',
            name: 'Card, Apple Pay, Google Pay & more',
            icon: 'fas fa-credit-card',
            subtitle: 'Powered by Stripe Checkout',
        },
        { id: 'bank', name: 'Bank transfer', icon: 'fas fa-university', subtitle: 'Manual payment' },
    ];

    const copyText = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text);
            showNotice('Copied', `${label} copied to clipboard.`, 'success');
        } catch {
            showNotice('Copy manually', text, 'info');
        }
    };

    const handleProofSelect = (file) => {
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowed.includes(file.type)) {
            showNotice('Invalid file', 'Please upload JPG, PNG, or PDF.', 'error');
            return;
        }
        if (file.size > 12 * 1024 * 1024) {
            showNotice('File too large', 'File must be under 12 MB.', 'error');
            return;
        }
        setProofFile(file);
        if (file.type.startsWith('image/')) {
            setProofPreview(URL.createObjectURL(file));
        } else {
            setProofPreview('');
        }
    };

    const validateRegistrationEmail = (rawEmail) => {
        const email = String(rawEmail || '').trim().toLowerCase();
        if (!email) return 'Email is required.';
        if (email.endsWith('@gorythmacademy.com')) {
            return 'Use your personal email (Gmail, Hotmail, etc.), not your @gorythmacademy.com portal address.';
        }
        return '';
    };

    const handleBankRegister = async (e) => {
        e.preventDefault();
        const emailError = validateRegistrationEmail(formData.email);
        if (emailError) {
            showNotice('Invalid email', emailError, 'error');
            return;
        }
        const normalizedPhone = String(formData.phone || '').replace(/\D/g, '');
        if (!/^\d{8,15}$/.test(normalizedPhone)) {
            showNotice('Invalid phone', 'Please enter a valid phone number with 8 to 15 digits.', 'error');
            return;
        }
        if (!formData.courseName) {
            showNotice('Course required', 'Please select a course.', 'error');
            return;
        }
        if (resolvedAmount <= 0) {
            showNotice('No fee', 'This course has no charge. Contact us to enroll.', 'error');
            return;
        }

        setBankSubmitting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/payments/register-online`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentName: formData.studentName.trim(),
                    email: formData.email.trim(),
                    phone: normalizedPhone,
                    courseName: formData.courseName,
                    amount: resolvedAmount,
                    paymentMethod: 'bank',
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to submit');
            }
            if (!data.payment?._id || !data.payment?.uploadToken) {
                throw new Error('Registration saved but upload session is incomplete. Please try again.');
            }
            if (data.message?.toLowerCase().includes('already have a pending')) {
                showNotice('Pending payment found', data.message, 'warning');
            }
            setBankPayment(data.payment);
            writeBankPaymentSession(data.payment);
            setBankStep(BANK_STEPS.INSTRUCTIONS);
        } catch (error) {
            const msg = error.message || 'Failed to submit';
            const isDuplicate =
                /already enrolled|completed payment for this course/i.test(msg);
            showNotice(isDuplicate ? 'Already enrolled' : 'Registration failed', msg, isDuplicate ? 'warning' : 'error');
        } finally {
            setBankSubmitting(false);
        }
    };

    const handleProofUpload = async () => {
        if (!proofFile) {
            showNotice('Proof required', 'Please upload a screenshot or PDF of your payment before submitting.', 'error');
            return;
        }
        const activePayment = bankPayment?._id && bankPayment?.uploadToken ? bankPayment : readBankPaymentSession();
        if (!activePayment?._id || !activePayment?.uploadToken) {
            showNotice(
                'Session expired',
                'Click "Edit details" and submit the registration form again.',
                'error'
            );
            return;
        }
        if (!bankPayment?._id) {
            setBankPayment(activePayment);
        }
        setProofUploading(true);
        try {
            const form = new FormData();
            form.append('file', proofFile);
            form.append('uploadToken', activePayment.uploadToken);
            const response = await fetch(`${API_BASE_URL}/api/payments/${activePayment._id}/proof`, {
                method: 'POST',
                body: form,
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Upload failed');
            }
            setBankStep(BANK_STEPS.DONE);
            clearBankPaymentSession();
            requestAnimationFrame(() => {
                successPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        } catch (error) {
            showNotice('Upload failed', error.message, 'error');
        } finally {
            setProofUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (paymentMethod === 'bank') {
            if (bankStep === BANK_STEPS.INSTRUCTIONS) {
                await handleProofUpload();
            } else if (bankStep === BANK_STEPS.FORM) {
                await handleBankRegister(e);
            }
            return;
        }

        const emailError = validateRegistrationEmail(formData.email);
        if (emailError) {
            showNotice('Invalid email', emailError, 'error');
            return;
        }
        const normalizedPhone = String(formData.phone || '').replace(/\D/g, '');
        if (!/^\d{8,15}$/.test(normalizedPhone)) {
            showNotice('Invalid phone', 'Please enter a valid phone number with 8 to 15 digits.', 'error');
            return;
        }

        if (!selectedCourse?._id) {
            showNotice('Course required', 'Please select a course from the list.', 'error');
            return;
        }
        if (resolvedAmount <= 0) {
            showNotice('No fee', 'This course has no charge. Contact us to enroll.', 'error');
            return;
        }
        setCheckoutLoading(true);
        try {
            let userId;
            try {
                const raw = getAuthUserJson();
                if (raw) {
                    const u = JSON.parse(raw);
                    if (u?._id) userId = u._id;
                }
            } catch {
                /* ignore */
            }

            const response = await fetch(`${API_BASE_URL}/api/payments/create-checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    courseId: String(selectedCourse._id),
                    studentName: formData.studentName.trim(),
                    email: formData.email.trim(),
                    phone: normalizedPhone,
                    ...(userId ? { userId: String(userId) } : {}),
                }),
            });
            const raw = await response.text();
            let data = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                throw new Error(
                    `Server returned non-JSON (${response.status}). Check API URL and CORS. ${raw.slice(0, 120)}`
                );
            }
            if (!response.ok || !data.success || !data.url) {
                throw new Error(
                    data.error ||
                        (response.status === 503
                            ? 'Stripe is not configured on the server (set STRIPE_SECRET_KEY).'
                            : `Could not start checkout (${response.status})`)
                );
            }
            window.location.href = data.url;
        } catch (error) {
            const msg = error.message || 'Checkout failed';
            const isDuplicate =
                /already enrolled|completed payment for this course/i.test(msg);
            showNotice(
                isDuplicate ? 'Already enrolled' : 'Checkout failed',
                msg,
                isDuplicate ? 'warning' : 'error'
            );
            setCheckoutLoading(false);
        }
    };

    const formattedFeePlan = paymentDetails.feePlan === 'per-month' ? 'Per Month' : paymentDetails.feePlan;
    const usdAmount = resolvedAmount;
    const localizedAmount = formatFromUsd(usdAmount);
    const shouldShowApprox = currency !== baseCurrency;

    const hasBankInfo =
        bankDetails &&
        (bankDetails.accountName ||
            bankDetails.bankName ||
            bankDetails.accountNumber ||
            bankDetails.iban ||
            bankDetails.swift);

    const bankTimelineStep = (step, label, active, done) => (
        <div className={`bank-timeline__step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`} key={step}>
            <span className="bank-timeline__dot">{done ? <i className="fas fa-check" /> : step}</span>
            <span>{label}</span>
        </div>
    );

    return (
        <section className="payment-page scheme_dark">
            <div className="payment-gateway">
                <div className="payment-shell">
                    <div className="payment-header">
                        <h1>Course Registration</h1>
                        <p>Pay online with Stripe or transfer via bank and upload your payment proof.</p>
                    </div>

                    <div className="payment-summary-banner">
                        <span className="payment-summary-course">
                            {formData.courseName || paymentDetails.courseName || 'Select a course'}
                        </span>
                        <strong>Total Amount: {localizedAmount}</strong>
                    </div>

                    {bankStep === BANK_STEPS.DONE ? (
                        <div className="payment-form bank-done-panel" ref={successPanelRef}>
                            <div className="bank-success-card">
                                <i className="fas fa-check-circle" aria-hidden />
                                <h3>Payment proof received</h3>
                                <p>
                                    Thank you! We will verify your transfer. Once confirmed as paid, your student record
                                    will appear in our system and we will contact you.
                                </p>
                            </div>
                            <div className="payment-footer-actions">
                                <Link to="/courses" className="back-to-courses-btn">
                                    <span className="back-arrow">←</span>
                                    <span>Back to All Courses</span>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form className="payment-form" onSubmit={handleSubmit}>
                            {bankStep === BANK_STEPS.FORM && (
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>Student Full Name *</label>
                                        <input
                                            type="text"
                                            placeholder="Enter full name"
                                            value={formData.studentName}
                                            onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Student/Parent Email *</label>
                                        <input
                                            type="email"
                                            placeholder="Enter email address"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="form-group form-group-wide">
                                        <label>Student/Parent Phone Number (whatsapp Please) *</label>
                                        <input
                                            type="tel"
                                            placeholder="Country code + phone no"
                                            value={formData.phone}
                                            inputMode="numeric"
                                            pattern="[0-9]{8,15}"
                                            minLength={8}
                                            maxLength={15}
                                            onChange={(e) =>
                                                setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })
                                            }
                                            required
                                        />
                                    </div>

                                    <div className="form-group form-group-wide">
                                        <label>Select Course *</label>
                                        <select
                                            value={formData.courseName}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    courseName: e.target.value,
                                                }))
                                            }
                                            required
                                        >
                                            <option value="" disabled>
                                                Choose a course
                                            </option>
                                            {courseOptions.map((course) => (
                                                <option key={course._id || course.title} value={course.title}>
                                                    {course.title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {bankStep === BANK_STEPS.FORM && (
                                <>
                                    <div className="payment-methods">
                                        <h3>Payment method</h3>
                                        <div className="methods-grid">
                                            {paymentMethods.map((method) => (
                                                <button
                                                    type="button"
                                                    key={method.id}
                                                    className={`method-btn ${paymentMethod === method.id ? 'active' : ''}`}
                                                    onClick={() => setPaymentMethod(method.id)}
                                                >
                                                    <span className="method-radio" aria-hidden="true" />
                                                    <i className={method.icon}></i>
                                                    <span className="method-btn-text">
                                                        <span className="method-btn-title">{method.name}</span>
                                                        {method.subtitle ? (
                                                            <span className="method-btn-sub">{method.subtitle}</span>
                                                        ) : null}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                        {paymentMethod === 'stripe' ? (
                                            <div className="payment-brand-row" aria-hidden="true">
                                                <span>Secured by Stripe</span>
                                                <div className="payment-brand-icons">
                                                    <span>AMEX</span>
                                                    <span>MC</span>
                                                    <span>VISA</span>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="payment-panel">
                                        {paymentMethod === 'stripe' ? (
                                            <>
                                                <div className="payment-panel-header">
                                                    <h3>Stripe Checkout</h3>
                                                    <p>
                                                        You will be redirected to Stripe to pay. Depending on your device
                                                        and region, you may see Apple Pay, Google Pay, Link, and other
                                                        options enabled for your account in the Stripe Dashboard.
                                                    </p>
                                                </div>
                                                <div className="payment-details-box">
                                                    <h4>Payment details</h4>
                                                    <div className="payment-detail-line">
                                                        <span>Amount ({baseCurrency}):</span>
                                                        <strong>${usdAmount.toFixed(2)}</strong>
                                                    </div>
                                                    {shouldShowApprox && (
                                                        <>
                                                            <div className="payment-detail-line">
                                                                <span>
                                                                    Displayed In
                                                                    {rateDate ? ` (${rateDate})` : ''}:
                                                                </span>
                                                                <strong>{currency}</strong>
                                                            </div>
                                                            <div className="payment-detail-line">
                                                                <span>Approx. local amount:</span>
                                                                <strong>{localizedAmount}</strong>
                                                            </div>
                                                        </>
                                                    )}
                                                    <p className="payment-detail-note">
                                                        {shouldShowApprox
                                                            ? `* Shown in ${currency} (approx.) from live rates. You are charged in ${baseCurrency}.`
                                                            : `* Charged in ${baseCurrency}.`}
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="payment-bank-info">
                                                <h3>Bank transfer</h3>
                                                <p>
                                                    Submit your details first. You will then see our bank account
                                                    information and can upload proof of payment.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {bankStep === BANK_STEPS.INSTRUCTIONS && bankPayment && (
                                <>
                                    <div className="bank-timeline">
                                        {bankTimelineStep(1, 'Registered', false, true)}
                                        {bankTimelineStep(2, 'Pay & upload proof', true, false)}
                                        {bankTimelineStep(3, 'Verified', false, false)}
                                    </div>

                                    <div className="bank-details-card">
                                        <h3>
                                            <i className="fas fa-university" /> Bank details
                                        </h3>
                                        {!hasBankInfo ? (
                                            <p className="bank-details-empty">
                                                Bank details are not configured yet. Please contact support.
                                            </p>
                                        ) : (
                                            <dl className="bank-details-list">
                                                {bankDetails.accountName ? (
                                                    <div className="bank-details-row">
                                                        <dt>Account name</dt>
                                                        <dd>
                                                            {bankDetails.accountName}
                                                            <button
                                                                type="button"
                                                                className="bank-copy-btn"
                                                                onClick={() => copyText(bankDetails.accountName, 'Account name')}
                                                            >
                                                                <i className="fas fa-copy" />
                                                            </button>
                                                        </dd>
                                                    </div>
                                                ) : null}
                                                {bankDetails.bankName ? (
                                                    <div className="bank-details-row">
                                                        <dt>Bank</dt>
                                                        <dd>{bankDetails.bankName}</dd>
                                                    </div>
                                                ) : null}
                                                {bankDetails.accountNumber ? (
                                                    <div className="bank-details-row">
                                                        <dt>Account number</dt>
                                                        <dd>
                                                            {bankDetails.accountNumber}
                                                            <button
                                                                type="button"
                                                                className="bank-copy-btn"
                                                                onClick={() =>
                                                                    copyText(bankDetails.accountNumber, 'Account number')
                                                                }
                                                            >
                                                                <i className="fas fa-copy" />
                                                            </button>
                                                        </dd>
                                                    </div>
                                                ) : null}
                                                {bankDetails.iban ? (
                                                    <div className="bank-details-row">
                                                        <dt>IBAN</dt>
                                                        <dd>
                                                            {bankDetails.iban}
                                                            <button
                                                                type="button"
                                                                className="bank-copy-btn"
                                                                onClick={() => copyText(bankDetails.iban, 'IBAN')}
                                                            >
                                                                <i className="fas fa-copy" />
                                                            </button>
                                                        </dd>
                                                    </div>
                                                ) : null}
                                                {bankDetails.swift ? (
                                                    <div className="bank-details-row">
                                                        <dt>SWIFT / BIC</dt>
                                                        <dd>{bankDetails.swift}</dd>
                                                    </div>
                                                ) : null}
                                                <div className="bank-details-row bank-details-row--highlight">
                                                    <dt>Amount to transfer</dt>
                                                    <dd>
                                                        <strong>
                                                            ${Number(bankPayment.amount || usdAmount).toFixed(2)}{' '}
                                                            {bankPayment.currency || baseCurrency}
                                                        </strong>
                                                    </dd>
                                                </div>
                                                <div className="bank-details-row bank-details-row--highlight">
                                                    <dt>Payment reference *</dt>
                                                    <dd>
                                                        <code>{bankPayment.transactionId}</code>
                                                        <button
                                                            type="button"
                                                            className="bank-copy-btn"
                                                            onClick={() =>
                                                                copyText(bankPayment.transactionId, 'Payment reference')
                                                            }
                                                        >
                                                            <i className="fas fa-copy" />
                                                        </button>
                                                    </dd>
                                                </div>
                                            </dl>
                                        )}
                                        {bankDetails?.extraNote ? (
                                            <p className="bank-details-note">{bankDetails.extraNote}</p>
                                        ) : null}
                                    </div>

                                    <div className="bank-upload-card">
                                        <h3>
                                            <i className="fas fa-cloud-upload-alt" /> Upload payment proof
                                        </h3>
                                        <p>After transferring, upload a screenshot or PDF of your bank receipt.</p>
                                        {!proofFile ? (
                                            <p className="bank-upload-required">Upload required before you can submit proof.</p>
                                        ) : null}
                                        <div
                                            className={`bank-upload-dropzone ${proofFile ? 'has-file' : ''}`}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const file = e.dataTransfer.files?.[0];
                                                handleProofSelect(file);
                                            }}
                                            onClick={() => proofInputRef.current?.click()}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') proofInputRef.current?.click();
                                            }}
                                        >
                                            <input
                                                ref={proofInputRef}
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                                hidden
                                                onChange={(e) => handleProofSelect(e.target.files?.[0])}
                                            />
                                            {proofPreview ? (
                                                <img src={proofPreview} alt="Payment proof preview" className="bank-upload-preview" />
                                            ) : proofFile ? (
                                                <div className="bank-upload-pdf">
                                                    <i className="fas fa-file-pdf" />
                                                    <span>{proofFile.name}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <i className="fas fa-image" />
                                                    <span>Drop file here or click to browse</span>
                                                    <small>JPG, PNG, or PDF — max 12 MB</small>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="payment-footer-row">
                                <div className="payment-security">
                                    <i className="fas fa-lock"></i>
                                    <span>
                                        {paymentMethod === 'stripe' ? 'Stripe secure checkout' : 'Secure registration'}
                                    </span>
                                </div>

                                <div className="payment-footer-actions">
                                    {bankStep === BANK_STEPS.INSTRUCTIONS ? (
                                        <button
                                            type="button"
                                            className="back-to-courses-btn"
                                            onClick={() => setBankStep(BANK_STEPS.FORM)}
                                        >
                                            <span className="back-arrow">←</span>
                                            <span>Edit details</span>
                                        </button>
                                    ) : (
                                        <Link to="/courses" className="back-to-courses-btn">
                                            <span className="back-arrow">←</span>
                                            <span>Back to All Courses</span>
                                        </Link>
                                    )}
                                    {bankStep !== BANK_STEPS.DONE && (
                                        <button
                                            type="submit"
                                            className="pay-now-btn"
                                            disabled={
                                                checkoutLoading ||
                                                bankSubmitting ||
                                                proofUploading ||
                                                (paymentMethod === 'bank' &&
                                                    bankStep === BANK_STEPS.INSTRUCTIONS &&
                                                    !proofFile)
                                            }
                                        >
                                            <i
                                                className={
                                                    paymentMethod === 'bank' && bankStep === BANK_STEPS.INSTRUCTIONS
                                                        ? 'fas fa-cloud-upload-alt'
                                                        : 'fas fa-credit-card'
                                                }
                                            />{' '}
                                            {paymentMethod === 'stripe'
                                                ? checkoutLoading
                                                    ? 'Redirecting…'
                                                    : `Continue to Stripe (${localizedAmount})`
                                                : bankStep === BANK_STEPS.INSTRUCTIONS
                                                  ? proofUploading
                                                      ? 'Uploading…'
                                                      : 'Submit payment proof'
                                                  : bankSubmitting
                                                    ? 'Saving…'
                                                    : `Continue to bank transfer (${localizedAmount})`}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {bankStep === BANK_STEPS.FORM && (
                                <p className="payment-note">
                                    Fee plan: {formattedFeePlan}. By continuing, you agree to our terms and privacy
                                    policy.
                                </p>
                            )}
                        </form>
                    )}
                </div>
            </div>
            <PaymentNoticeModal notice={notice} onClose={() => setNotice(null)} />
        </section>
    );
};

export default PaymentGateway;
