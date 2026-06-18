import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/constants';
import { getAuthUserJson } from '../../../utils/authStorage';
import { useCurrency } from '../../../context/CurrencyContext';
import { compressImageForUpload, IMAGE_UPLOAD_PRESETS } from '../../../utils/compressImageForUpload';
import SiteValidationModal from '../../SiteValidationModal/SiteValidationModal';
import './PaymentGateway.scss';

const BANK_STEPS = {
    FORM: 'form',
    DONE: 'done',
};

const PROOF_MAX_BYTES = 1024 * 1024;
const PROOF_MAX_MB = 1;

function collectBankValidationIssues({ formData, proofFile, hasBankInfo, resolvedAmount, validateEmail }) {
    const issues = [];
    if (!formData.courseName) {
        issues.push('Please select a course.');
    }
    if (!formData.studentName?.trim()) {
        issues.push('Please enter the student full name.');
    }
    const email = String(formData.email || '').trim();
    if (!email) {
        issues.push('Please enter your email address.');
    } else {
        const emailError = validateEmail(email);
        if (emailError) issues.push(emailError);
    }
    const phoneDigits = String(formData.phone || '').replace(/\D/g, '');
    if (!phoneDigits) {
        issues.push('Please enter your phone number (WhatsApp, with country code).');
    } else if (!/^\d{8,15}$/.test(phoneDigits)) {
        issues.push('Phone number must be 8 to 15 digits.');
    }
    if (!proofFile) {
        issues.push('Please upload a screenshot or PDF of your bank transfer.');
    }
    if (!hasBankInfo) {
        issues.push('Bank transfer is not configured yet. Use Stripe or contact support.');
    }
    if (resolvedAmount <= 0) {
        issues.push('This course has no charge. Contact us to enroll.');
    }
    return issues;
}

async function parseJsonResponse(response) {
    const raw = await response.text();
    try {
        return { data: raw ? JSON.parse(raw) : {}, raw };
    } catch {
        const snippet = raw.trim().startsWith('<') ? 'Server returned an HTML error page' : raw.slice(0, 120);
        throw new Error(
            response.status === 413
                ? `File is too large (max ${PROOF_MAX_MB} MB). Use a smaller screenshot or JPG/PNG instead of PDF.`
                : `Server error (${response.status}): ${snippet}`
        );
    }
}

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
    const [proofFile, setProofFile] = useState(null);
    const [proofPreview, setProofPreview] = useState('');
    const [proofPreparing, setProofPreparing] = useState(false);
    const [bankSubmitting, setBankSubmitting] = useState(false);
    const proofInputRef = useRef(null);
    const successPanelRef = useRef(null);
    const [notice, setNotice] = useState(null);
    const [validationModal, setValidationModal] = useState({ open: false, title: '', issues: [] });

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
        if (paymentMethod !== 'bank') {
            setBankStep(BANK_STEPS.FORM);
            setProofFile(null);
            setProofPreview('');
        }
    }, [paymentMethod]);

    const selectedCourse = useMemo(
        () => courseOptions.find((course) => course?.title === formData.courseName) || null,
        [courseOptions, formData.courseName]
    );
    const resolvedAmount = Number(selectedCourse?.price ?? paymentDetails.amount) || 0;

    const hasBankInfo = Boolean(
        bankDetails &&
            (bankDetails.accountName ||
                bankDetails.bankName ||
                bankDetails.accountNumber ||
                bankDetails.iban ||
                bankDetails.swift)
    );

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

    const handleProofSelect = async (file) => {
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowed.includes(file.type)) {
            showNotice('Invalid file', 'Please upload JPG, PNG, WebP, or PDF.', 'error');
            return;
        }
        if (file.size > PROOF_MAX_BYTES) {
            showNotice(
                'File too large',
                `Maximum file size is ${PROOF_MAX_MB} MB. Use a smaller screenshot or compress your PDF.`,
                'error'
            );
            return;
        }

        setProofPreparing(true);
        try {
            let prepared = file;
            if (file.type.startsWith('image/')) {
                prepared = await compressImageForUpload(file, IMAGE_UPLOAD_PRESETS.paymentProof);
            }
            if (prepared.size > PROOF_MAX_BYTES) {
                showNotice(
                    'File too large',
                    `Maximum file size is ${PROOF_MAX_MB} MB. Use a smaller screenshot or compress your PDF.`,
                    'error'
                );
                return;
            }
            setProofFile(prepared);
            if (prepared.type.startsWith('image/')) {
                setProofPreview(URL.createObjectURL(prepared));
            } else {
                setProofPreview('');
            }
        } catch {
            showNotice('Could not prepare file', 'Try a different image or PDF.', 'error');
        } finally {
            setProofPreparing(false);
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

    const handleBankSubmit = async () => {
        const issues = collectBankValidationIssues({
            formData,
            proofFile,
            hasBankInfo,
            resolvedAmount,
            validateEmail: validateRegistrationEmail,
        });
        if (issues.length > 0) {
            setValidationModal({
                open: true,
                title: 'Please check the following',
                issues,
            });
            return;
        }

        const normalizedPhone = String(formData.phone || '').replace(/\D/g, '');

        setBankSubmitting(true);
        try {
            const form = new FormData();
            form.append('studentName', formData.studentName.trim());
            form.append('email', formData.email.trim());
            form.append('phone', normalizedPhone);
            form.append('courseName', formData.courseName);
            form.append('file', proofFile);

            const response = await fetch(`${API_BASE_URL}/api/payments/register-bank`, {
                method: 'POST',
                body: form,
            });
            const { data } = await parseJsonResponse(response);
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to submit');
            }
            setBankStep(BANK_STEPS.DONE);
            setProofFile(null);
            setProofPreview('');
            requestAnimationFrame(() => {
                successPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        } catch (error) {
            const msg = error.message || 'Failed to submit';
            const isDuplicate = /already enrolled|completed payment|awaiting review/i.test(msg);
            showNotice(isDuplicate ? 'Already submitted' : 'Submission failed', msg, isDuplicate ? 'warning' : 'error');
        } finally {
            setBankSubmitting(false);
        }
    };

    const handleStripeCheckout = async () => {
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
                    ...(userId ? { userId: String(userId) } : {}),
                }),
            });
            const { data } = await parseJsonResponse(response);
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
            const isDuplicate = /already enrolled|completed payment for this course/i.test(msg);
            showNotice(
                isDuplicate ? 'Already enrolled' : 'Checkout failed',
                msg,
                isDuplicate ? 'warning' : 'error'
            );
            setCheckoutLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (paymentMethod === 'bank') {
            await handleBankSubmit();
            return;
        }
        await handleStripeCheckout();
    };

    const usdAmount = resolvedAmount;
    const localizedAmount = formatFromUsd(usdAmount);
    const shouldShowApprox = currency !== baseCurrency;

    const stripeReady = Boolean(selectedCourse?._id) && resolvedAmount > 0;

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

                                    {paymentMethod === 'bank' ? (
                                        <>
                                            <div className="form-group">
                                                <label>Student Full Name *</label>
                                                <input
                                                    type="text"
                                                    placeholder="Enter full name"
                                                    value={formData.studentName}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, studentName: e.target.value })
                                                    }
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
                                                        setFormData({
                                                            ...formData,
                                                            phone: e.target.value.replace(/\D/g, ''),
                                                        })
                                                    }
                                                    required
                                                />
                                            </div>
                                        </>
                                    ) : null}
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
                                                        You will be redirected to Stripe. Enter your name, email, and
                                                        phone on the secure Stripe Checkout page — we do not collect them
                                                        here.
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
                                                    Transfer the fee using the bank details below, upload your payment
                                                    proof, then submit once. Your record is created only after you submit.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {bankStep === BANK_STEPS.FORM && paymentMethod === 'bank' ? (
                                <>
                                    <div className="bank-details-card">
                                        <h3>
                                            <i className="fas fa-university" /> Bank details
                                        </h3>
                                        {!hasBankInfo ? (
                                            <p className="bank-details-empty">
                                                Bank details are not configured yet. Please contact support or use Stripe.
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
                                                            ${usdAmount.toFixed(2)} {baseCurrency}
                                                        </strong>
                                                    </dd>
                                                </div>
                                                <div className="bank-details-row">
                                                    <dt>Reference hint</dt>
                                                    <dd>Use your email or phone in the bank transfer note</dd>
                                                </div>
                                            </dl>
                                        )}
                                        {bankDetails?.extraNote ? (
                                            <p className="bank-details-note">{bankDetails.extraNote}</p>
                                        ) : null}
                                    </div>

                                    <div className="bank-upload-card">
                                        <h3>
                                            <i className="fas fa-cloud-upload-alt" /> Upload payment proof *
                                        </h3>
                                        <p>After transferring, attach a screenshot or PDF of your bank receipt.</p>
                                        <div
                                            className={`bank-upload-dropzone ${proofFile ? 'has-file' : ''}`}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const file = e.dataTransfer.files?.[0];
                                                handleProofSelect(file);
                                            }}
                                            onClick={() => !proofPreparing && proofInputRef.current?.click()}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ')
                                                    !proofPreparing && proofInputRef.current?.click();
                                            }}
                                        >
                                            <input
                                                ref={proofInputRef}
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                                hidden
                                                onChange={(e) => handleProofSelect(e.target.files?.[0])}
                                            />
                                            {proofPreparing ? (
                                                <span>
                                                    <i className="fas fa-spinner fa-spin" /> Preparing image…
                                                </span>
                                            ) : proofPreview ? (
                                                <img
                                                    src={proofPreview}
                                                    alt="Payment proof preview"
                                                    className="bank-upload-preview"
                                                />
                                            ) : proofFile ? (
                                                <div className="bank-upload-pdf">
                                                    <i className="fas fa-file-pdf" />
                                                    <span>{proofFile.name}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <i className="fas fa-image" />
                                                    <span>Drop file here or click to browse</span>
                                                    <small>JPG, PNG, WebP, or PDF — images are compressed automatically</small>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : null}

                            <div className="payment-footer-row">
                                <div className="payment-security">
                                    <i className="fas fa-lock"></i>
                                    <span>
                                        {paymentMethod === 'stripe' ? 'Stripe secure checkout' : 'Secure registration'}
                                    </span>
                                </div>

                                <div className="payment-footer-actions">
                                    <Link to="/courses" className="back-to-courses-btn">
                                        <span className="back-arrow">←</span>
                                        <span>Back to All Courses</span>
                                    </Link>
                                    {bankStep !== BANK_STEPS.DONE && (
                                        <button
                                            type="submit"
                                            className="pay-now-btn"
                                            disabled={
                                                checkoutLoading ||
                                                bankSubmitting ||
                                                proofPreparing ||
                                                (paymentMethod === 'stripe' && !stripeReady)
                                            }
                                        >
                                            <i
                                                className={
                                                    paymentMethod === 'bank'
                                                        ? 'fas fa-paper-plane'
                                                        : 'fas fa-credit-card'
                                                }
                                            />{' '}
                                            {paymentMethod === 'stripe'
                                                ? checkoutLoading
                                                    ? 'Redirecting…'
                                                    : `Continue to Stripe (${localizedAmount})`
                                                : bankSubmitting
                                                  ? 'Submitting…'
                                                  : `Submit bank payment (${localizedAmount})`}
                                        </button>
                                    )}
                                </div>
                            </div>

                        </form>
                    )}
                </div>
            </div>
            <PaymentNoticeModal notice={notice} onClose={() => setNotice(null)} />
            <SiteValidationModal
                open={validationModal.open}
                title={validationModal.title}
                issues={validationModal.issues}
                onClose={() => setValidationModal((prev) => ({ ...prev, open: false }))}
            />
        </section>
    );
};

export default PaymentGateway;
