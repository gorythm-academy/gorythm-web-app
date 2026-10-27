import React, { useEffect, useMemo, useRef, useState } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import { Link, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/constants';
import { buildAuthHeaders, hasAuthSession, AUTH_REALM } from '../../../utils/authStorage';
import { useCurrency } from '../../../context/CurrencyContext';
import { formatCurrency as formatChargeCurrency } from '../../../utils/currency';
import { compressImageForUpload, IMAGE_UPLOAD_PRESETS } from '../../../utils/compressImageForUpload';
import SiteValidationModal from '../../SiteValidationModal/SiteValidationModal';
import PhoneNumberField from '../../shared/PhoneNumberField';
import { WHATSAPP_PHONE_MESSAGES } from '../../../utils/phoneNumber';
import { rememberPaymentCourseId } from '../../../utils/paymentCourseContext';
import './PaymentGateway.scss';

const BANK_STEPS = {
    FORM: 'form',
    DONE: 'done',
};

const PROOF_MAX_BYTES = 1024 * 1024;
const PROOF_MAX_MB = 1;

function collectBankValidationIssues({ formData, proofFile, hasBankInfo, resolvedAmount, validateEmail, selectedCourse }) {
    const issues = [];
    if (!selectedCourse?._id) {
        issues.push('Please select a course.');
    }
    if (!formData.studentName?.trim()) {
        issues.push('Please enter the student full name.');
    }
    const email = String(formData.email || '').trim();
    if (!email) {
        issues.push('Please enter the student email address.');
    } else {
        const emailError = validateEmail(email);
        if (emailError) issues.push(emailError);
    }
    const parentEmail = String(formData.parentEmail || '').trim();
    if (parentEmail) {
        const parentError = validateEmail(parentEmail);
        if (parentError && parentError !== 'Email is required.') issues.push(`Parent email: ${parentError}`);
    }
    if (formData.phoneStatus !== 'valid') {
        issues.push(
            formData.phoneStatus === 'invalid'
                ? WHATSAPP_PHONE_MESSAGES.invalid
                : WHATSAPP_PHONE_MESSAGES.required
        );
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

const DUPLICATE_EMAIL_PATTERN = /already enrolled|already paid|completed payment|awaiting review|already in use|already exists|already in our records/i;

async function loadEmailNotice(rawEmail, { role = 'student', courseId, studentEmail } = {}) {
    const email = String(rawEmail || '').trim();
    if (!email || !email.includes('@')) return null;
    const params = new URLSearchParams({ email });
    if (role === 'parent') params.set('role', 'parent');
    if (courseId) params.set('courseId', String(courseId));
    if (studentEmail) params.set('studentEmail', String(studentEmail || '').trim());
    try {
        const response = await fetch(`${API_BASE_URL}/api/payments/email-notice?${params}`, {
            credentials: 'include',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) return null;
        if (data.level !== 'warning' && data.level !== 'block') return null;
        return { level: data.level, message: data.message || '' };
    } catch {
        return null;
    }
}

const PaymentGateway = () => {
    const location = useLocation();
    const { currency, baseCurrency, formatFromBase, rateDate, applyCurrencyCode, isLoading: currencyLoading, locale } = useCurrency();
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
    const didInitFromUrl = useRef(false);
    const [coursesLoaded, setCoursesLoaded] = useState(false);
    const [coursesFetchError, setCoursesFetchError] = useState('');
    const [urlCourseError, setUrlCourseError] = useState('');
    const [notice, setNotice] = useState(null);
    const [validationModal, setValidationModal] = useState({ open: false, title: '', issues: [] });
    const [selectedCourseIds, setSelectedCourseIds] = useState([]);
    const [invoiceMode, setInvoiceMode] = useState('combined');
    const [autoPayConsent, setAutoPayConsent] = useState(true);
    const [studentEmailNotice, setStudentEmailNotice] = useState(null);
    const [parentEmailNotice, setParentEmailNotice] = useState(null);

    const showNotice = (title, message, type = 'info') => {
        setNotice({ title, message, type });
    };
    const [formData, setFormData] = useState({
        studentName: '',
        phone: '',
        phoneStatus: 'empty',
        email: '',
        parentEmail: '',
    });

    const paymentDetails = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const courseId = params.get('courseId') || '';
        const legacyCourseName = params.get('courseName') || '';
        const amount = params.get('amount') || '0';
        const feePlan = params.get('feePlan') || 'one-time';
        const displayCurrency = (params.get('displayCurrency') || '').trim().toUpperCase();
        return { courseId, legacyCourseName, amount, feePlan, displayCurrency };
    }, [location.search]);

    useEffect(() => {
        didInitFromUrl.current = false;
        setSelectedCourseIds([]);
        if (paymentDetails.courseId) {
            setUrlCourseError('');
        } else if (paymentDetails.legacyCourseName) {
            setUrlCourseError(
                'This link uses an old course name. Please select your course from the list below.'
            );
        } else {
            setUrlCourseError('');
        }
    }, [paymentDetails.courseId, paymentDetails.legacyCourseName]);

    useEffect(() => {
        if (!paymentDetails.displayCurrency || currencyLoading) return;
        applyCurrencyCode(paymentDetails.displayCurrency);
    }, [paymentDetails.displayCurrency, currencyLoading, applyCurrencyCode]);

    useEffect(() => {
        if (selectedCourseIds[0]) rememberPaymentCourseId(selectedCourseIds[0]);
    }, [selectedCourseIds]);

    useEffect(() => {
        let cancelled = false;
        const fetchCourses = async () => {
            setCoursesFetchError('');
            try {
                const response = await fetch(`${API_BASE_URL}/api/courses/public`);
                if (!response.ok) {
                    if (!cancelled) {
                        setCourseOptions([]);
                        setCoursesFetchError('Could not load courses. Check your connection and refresh the page.');
                    }
                    return;
                }
                const data = await response.json();
                if (!cancelled) {
                    if (!data?.success) {
                        setCourseOptions([]);
                        setCoursesFetchError('Could not load courses. Please try again in a moment.');
                        return;
                    }
                    const courses = Array.isArray(data?.courses) ? data.courses : [];
                    setCourseOptions(courses.filter((course) => Number(course?.price) > 0));
                }
            } catch {
                if (!cancelled) {
                    setCourseOptions([]);
                    setCoursesFetchError('Could not load courses. Check your connection and refresh the page.');
                }
            } finally {
                if (!cancelled) setCoursesLoaded(true);
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
        const urlCourseId = paymentDetails.courseId;
        if (!urlCourseId || !coursesLoaded) return;
        if (courseOptions.some((course) => String(course._id) === String(urlCourseId))) {
            setUrlCourseError('');
            return;
        }

        let cancelled = false;
        const fetchUrlCourse = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/payments/course/${urlCourseId}`);
                const data = await response.json().catch(() => ({}));
                if (cancelled) return;
                if (!response.ok || !data.success || !data.course) {
                    setUrlCourseError(data.error || 'This course is not open for enrollment.');
                    setSelectedCourseIds([]);
                    return;
                }
                setUrlCourseError('');
                setCourseOptions((prev) => {
                    if (prev.some((course) => String(course._id) === String(data.course._id))) {
                        return prev;
                    }
                    return [...prev, data.course];
                });
            } catch {
                if (!cancelled) {
                    setUrlCourseError('Could not load course from link.');
                    setSelectedCourseIds([]);
                }
            }
        };

        fetchUrlCourse();
        return () => {
            cancelled = true;
        };
    }, [paymentDetails.courseId, coursesLoaded, courseOptions]);

    useEffect(() => {
        if (didInitFromUrl.current) return;
        if (paymentDetails.courseId) {
            const match = courseOptions.find(
                (course) => String(course._id) === String(paymentDetails.courseId)
            );
            if (match) {
                setSelectedCourseIds([String(match._id)]);
                didInitFromUrl.current = true;
            }
            return;
        }
        if (coursesLoaded && courseOptions.length === 1) {
            setSelectedCourseIds([String(courseOptions[0]._id)]);
            didInitFromUrl.current = true;
        }
    }, [paymentDetails.courseId, courseOptions, coursesLoaded]);

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

    const selectedCourses = useMemo(
        () =>
            selectedCourseIds
                .map((id) => courseOptions.find((course) => String(course._id) === id))
                .filter(Boolean),
        [courseOptions, selectedCourseIds]
    );
    const selectedCourse = selectedCourses[0] || null;

    useEffect(() => {
        const email = formData.email.trim();
        if (!email.includes('@')) {
            setStudentEmailNotice(null);
            return undefined;
        }
        let cancel = false;
        const timer = setTimeout(() => {
            loadEmailNotice(email, { courseId: selectedCourse?._id }).then((notice) => {
                if (!cancel) setStudentEmailNotice(notice);
            });
        }, 400);
        return () => {
            cancel = true;
            clearTimeout(timer);
        };
    }, [formData.email, selectedCourse?._id]);

    useEffect(() => {
        const email = formData.parentEmail.trim();
        if (!email.includes('@')) {
            setParentEmailNotice(null);
            return undefined;
        }
        let cancel = false;
        const timer = setTimeout(() => {
            loadEmailNotice(email, { role: 'parent', studentEmail: formData.email }).then((notice) => {
                if (!cancel) setParentEmailNotice(notice);
            });
        }, 400);
        return () => {
            cancel = true;
            clearTimeout(timer);
        };
    }, [formData.parentEmail, formData.email]);
    const extraCourses = selectedCourses.slice(1);
    const resolvedAmount = selectedCourses.reduce(
        (sum, course) => sum + (Number(course.price) || 0),
        0
    );

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
            setProofPreview(URL.createObjectURL(prepared));
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
            return 'Please enter an email you can open, such as Gmail or Hotmail.';
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
            selectedCourse,
        });
        if (issues.length > 0) {
            setValidationModal({
                open: true,
                title: 'Please check the following',
                issues,
            });
            return;
        }

        if (!selectedCourse?._id) {
            setValidationModal({
                open: true,
                title: 'Please check the following',
                issues: ['Please select a valid course.'],
            });
            return;
        }

        const studentNotice = await loadEmailNotice(formData.email, { courseId: selectedCourse._id });
        setStudentEmailNotice(studentNotice);
        if (studentNotice?.level === 'block') {
            showNotice('Please check this email', studentNotice.message, 'warning');
            return;
        }
        const parentRaw = String(formData.parentEmail || '').trim();
        const parentNotice = parentRaw
            ? await loadEmailNotice(parentRaw, { role: 'parent', studentEmail: formData.email })
            : null;
        setParentEmailNotice(parentNotice);
        if (parentNotice?.level === 'block') {
            showNotice('Please check the parent email', parentNotice.message, 'warning');
            return;
        }

        setBankSubmitting(true);
        try {
            const form = new FormData();
            form.append('studentName', formData.studentName.trim());
            form.append('email', formData.email.trim());
            form.append('parentEmail', formData.parentEmail.trim());
            form.append('phone', formData.phone);
            form.append('courseId', String(selectedCourse._id));
            if (extraCourses.length) {
                form.append('courseIds', JSON.stringify(extraCourses.map((course) => String(course._id))));
                form.append('invoiceMode', invoiceMode);
            }
            form.append('file', proofFile);

            const response = await fetch(`${API_BASE_URL}/api/payments/register-bank`, {
                method: 'POST',
                credentials: 'include',
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
            const isDuplicate = DUPLICATE_EMAIL_PATTERN.test(msg);
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
        const stripeIssues = [];
        if (!formData.studentName?.trim()) stripeIssues.push('Please enter the student full name.');
        const studentEmailError = validateRegistrationEmail(formData.email);
        if (studentEmailError) stripeIssues.push(studentEmailError);
        const parentRaw = String(formData.parentEmail || '').trim();
        if (parentRaw) {
            const parentEmailError = validateRegistrationEmail(parentRaw);
            if (parentEmailError && parentEmailError !== 'Email is required.') {
                stripeIssues.push(`Parent email: ${parentEmailError}`);
            }
        }
        if (stripeIssues.length) {
            setValidationModal({
                open: true,
                title: 'Please check the following',
                issues: stripeIssues,
            });
            return;
        }
        if (resolvedAmount <= 0) {
            showNotice('No fee', 'This course has no charge. Contact us to enroll.', 'error');
            return;
        }
        const studentNotice = await loadEmailNotice(formData.email, { courseId: selectedCourse._id });
        setStudentEmailNotice(studentNotice);
        if (studentNotice?.level === 'block') {
            showNotice('Please check this email', studentNotice.message, 'warning');
            return;
        }
        const parentRawCheck = String(formData.parentEmail || '').trim();
        const parentNotice = parentRawCheck
            ? await loadEmailNotice(parentRawCheck, { role: 'parent', studentEmail: formData.email })
            : null;
        setParentEmailNotice(parentNotice);
        if (parentNotice?.level === 'block') {
            showNotice('Please check the parent email', parentNotice.message, 'warning');
            return;
        }
        setCheckoutLoading(true);
        rememberPaymentCourseId(selectedCourse._id);
        try {
            // Checkout is portal-scoped; always send realm so an admin cookie cannot bind payment.
            const response = await fetch(`${API_BASE_URL}/api/payments/create-checkout`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(hasAuthSession(AUTH_REALM.PORTAL)
                        ? buildAuthHeaders(AUTH_REALM.PORTAL)
                        : { 'X-Auth-Realm': 'portal' }),
                },
                body: JSON.stringify({
                    courseId: String(selectedCourse._id),
                    studentName: formData.studentName.trim(),
                    studentEmail: formData.email.trim(),
                    email: formData.email.trim(),
                    parentEmail: formData.parentEmail.trim(),
                    ...(extraCourses.length
                        ? {
                              courseIds: extraCourses.map((course) => String(course._id)),
                              invoiceMode,
                          }
                        : {}),
                    autoPay: autoPayConsent,
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
            const isDuplicate = DUPLICATE_EMAIL_PATTERN.test(msg);
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
    const chargeLabel = (amount) => formatChargeCurrency(Number(amount) || 0, baseCurrency, locale);
    const localizedAmount = formatFromBase(usdAmount);
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
                            {selectedCourses.length
                                ? selectedCourses.map((course) => course.title).join(' · ')
                                : 'Select a course'}
                        </span>
                        <strong>Total Amount: {chargeLabel(usdAmount)}</strong>
                        {shouldShowApprox ? (
                            <span>Approx. {localizedAmount}</span>
                        ) : null}
                    </div>

                    {bankStep === BANK_STEPS.DONE ? (
                        <div className="payment-form bank-done-panel" ref={successPanelRef}>
                            <div className="bank-success-card">
                                <i className="fas fa-check-circle" aria-hidden />
                                <h3>Payment Proof Received</h3>
                                <p>
                                    Thank you. We will check your transfer. Once it is confirmed, we will email a
                                    link to choose a password. If you entered a parent email, the parent will receive
                                    the invoice and a link to sign in.
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
                                    <div className="form-group form-group-wide extra-courses">
                                        <label>Courses to Enroll <RequiredMark /></label>
                                        <p className="payment-course-hint">
                                            Tick every course to include in this checkout. Selected courses are added to the total above.
                                        </p>
                                        <div className="extra-courses-list" role="group" aria-label="Courses to enroll">
                                            {courseOptions.length === 0 && coursesLoaded ? (
                                                <p className="payment-url-course-error" role="alert">
                                                    No published courses are available for enrollment right now.
                                                </p>
                                            ) : (
                                                courseOptions.map((course) => {
                                                    const id = String(course._id);
                                                    const checked = selectedCourseIds.includes(id);
                                                    return (
                                                        <label key={id} className={`extra-course-item${checked ? ' is-selected' : ''}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={(e) => {
                                                                    didInitFromUrl.current = true;
                                                                    setSelectedCourseIds((prev) =>
                                                                        e.target.checked
                                                                            ? [...prev, id]
                                                                            : prev.filter((value) => value !== id)
                                                                    );
                                                                }}
                                                            />
                                                            <span className="extra-course-item__copy">
                                                                <strong>{course.title}</strong>
                                                                {course.category ? <em>{course.category}</em> : null}
                                                            </span>
                                                            <span className="extra-course-item__price">
                                                                {chargeLabel(Number(course.price || 0))}
                                                            </span>
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                        {coursesFetchError ? (
                                            <p className="payment-url-course-error" role="alert">
                                                {coursesFetchError}
                                            </p>
                                        ) : null}
                                        {urlCourseError ? (
                                            <p className="payment-url-course-error" role="alert">
                                                {urlCourseError}
                                            </p>
                                        ) : null}
                                        {selectedCourses.length > 1 ? (
                                            <div className="invoice-mode-row">
                                                <label>
                                                    <input
                                                        type="radio"
                                                        name="invoiceMode"
                                                        checked={invoiceMode === 'combined'}
                                                        onChange={() => setInvoiceMode('combined')}
                                                    />
                                                    One combined invoice
                                                </label>
                                                <label>
                                                    <input
                                                        type="radio"
                                                        name="invoiceMode"
                                                        checked={invoiceMode === 'separate'}
                                                        onChange={() => setInvoiceMode('separate')}
                                                    />
                                                    Separate Invoice per Course
                                                </label>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="form-group">
                                        <label>Student Full Name <RequiredMark /></label>
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
                                        <label>Student Email <RequiredMark /></label>
                                        <input
                                            type="email"
                                            placeholder="name@email.com"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                        <p className="payment-course-hint">This email will be the student’s sign-in.</p>
                                        {studentEmailNotice?.message ? (
                                            <p className={`payment-email-notice payment-email-notice--${studentEmailNotice.level}`} role="status">
                                                {studentEmailNotice.message}
                                            </p>
                                        ) : null}
                                    </div>

                                    <div className="form-group">
                                        <label>Parent Email (optional)</label>
                                        <input
                                            type="email"
                                            placeholder="parent@email.com"
                                            value={formData.parentEmail}
                                            onChange={(e) => setFormData({ ...formData, parentEmail: e.target.value })}
                                        />
                                        <p className="payment-course-hint">This email will be the parent’s sign-in.</p>
                                        {parentEmailNotice?.message ? (
                                            <p className={`payment-email-notice payment-email-notice--${parentEmailNotice.level}`} role="status">
                                                {parentEmailNotice.message}
                                            </p>
                                        ) : null}
                                    </div>

                                    {paymentMethod === 'bank' ? (
                                        <>
                                            <div className="form-group form-group-wide">
                                                <label id="bank-whatsapp-label" htmlFor="bank-whatsapp">Student/Parent Phone Number (WhatsApp Please) <RequiredMark /></label>
                                                <PhoneNumberField
                                                    id="bank-whatsapp"
                                                    appearance="dark"
                                                    required
                                                    value={formData.phone}
                                                    ariaLabel="WhatsApp number"
                                                    onChange={({ e164, status }) =>
                                                        setFormData((current) => ({
                                                            ...current,
                                                            phone: e164,
                                                            phoneStatus: status,
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            )}

                            {bankStep === BANK_STEPS.FORM && (
                                <>
                                    <div className="payment-methods">
                                        <h3>Payment Method</h3>
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
                                                        You will be taken to Stripe to pay by card. We will use the emails you entered above.
                                                    </p>
                                                </div>
                                                <div className="payment-details-box">
                                                    <h4>Payment Details</h4>
                                                    <div className="payment-detail-line">
                                                        <span>Amount ({baseCurrency}):</span>
                                                        <strong>{chargeLabel(usdAmount)}</strong>
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
                                                                <span>Approx. Local Amount:</span>
                                                                <strong>{localizedAmount}</strong>
                                                            </div>
                                                        </>
                                                    )}
                                                    <p className="payment-detail-note">
                                                        {shouldShowApprox
                                                            ? 'The amount in your currency is an estimate. You are charged in euros. Your bank sets the final amount in your currency, and its rate may differ.'
                                                            : `* Charged in ${baseCurrency}.`}
                                                    </p>
                                                </div>
                                                <label className="payment-autopay">
                                                    <input
                                                        type="checkbox"
                                                        checked={autoPayConsent}
                                                        onChange={(e) => setAutoPayConsent(e.target.checked)}
                                                    />
                                                    <span>
                                                        <strong>Charge this card automatically each month</strong>
                                                        <em>
                                                            Untick this to pay only this checkout.
                                                            {selectedCourses.length
                                                                ? ` While it is ticked, we save the card and charge ${selectedCourses.map((course) => `${chargeLabel(Number(course.price || 0))} for ${course.title}`).join('; ')} each later month until the course fees are paid. Later months are charged in euros.`
                                                                : ' While it is ticked, we save the card and charge the monthly fee in euros until the course fees are paid.'}
                                                            {' '}You can turn this off later from your account.
                                                        </em>
                                                    </span>
                                                </label>
                                            </>
                                        ) : (
                                            <div className="payment-bank-info">
                                                <h3>Bank Transfer</h3>
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
                                                        <dt>Account Name</dt>
                                                        <dd>
                                                            {bankDetails.accountName}
                                                            <button
                                                                type="button"
                                                                className="bank-copy-btn"
                                                                onClick={() => copyText(bankDetails.accountName, 'Account Name')}
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
                                                        <dt>Account Number</dt>
                                                        <dd>
                                                            {bankDetails.accountNumber}
                                                            <button
                                                                type="button"
                                                                className="bank-copy-btn"
                                                                onClick={() =>
                                                                    copyText(bankDetails.accountNumber, 'Account Number')
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
                                                    <dt>Amount to Transfer</dt>
                                                    <dd>
                                                        <strong>
                                                            {chargeLabel(usdAmount)}
                                                        </strong>
                                                        {shouldShowApprox ? (
                                                            <p className="payment-detail-note">
                                                                Approx. {localizedAmount}. The amount in your currency is an estimate. You are charged in euros. Your bank sets the final amount in your currency, and its rate may differ.
                                                            </p>
                                                        ) : null}
                                                    </dd>
                                                </div>
                                                <div className="bank-details-row">
                                                    <dt>Reference Hint</dt>
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
                                            <i className="fas fa-cloud-upload-alt" /> Upload payment proof <RequiredMark />
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
                                            ) : proofPreview && proofFile?.type === 'application/pdf' ? (
                                                <iframe
                                                    src={proofPreview}
                                                    title={proofFile.name || 'Payment proof PDF'}
                                                    className="bank-upload-preview bank-upload-preview--pdf"
                                                />
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
                                                    <span>Drop File Here or Click to Browse</span>
                                                    <small>JPG, PNG, WebP, or PDF — images are compressed automatically</small>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : null}

                            <p className="payment-legal-note">
                                By continuing you agree to our{' '}
                                <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link>
                                {' and '}
                                <Link to="/refunds" target="_blank" rel="noopener noreferrer">Refund Policy</Link>
                                . Payments are described in the{' '}
                                <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
                            </p>
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
