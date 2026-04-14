import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { API_BASE_URL, BANK_TRANSFER_NOTE, CONTACT_EMAIL } from '../../../config/constants';
import { getAuthUserJson } from '../../../utils/authStorage';
import { useCurrency } from '../../../context/CurrencyContext';
import './PaymentGateway.scss';

const PaymentGateway = () => {
    const location = useLocation();
    const { currency, baseCurrency, formatFromUsd, rateDate } = useCurrency();
    const [paymentMethod, setPaymentMethod] = useState('stripe');
    const [courseOptions, setCourseOptions] = useState([]);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [formData, setFormData] = useState({
        studentName: '',
        phone: '',
        email: '',
        courseName: ''
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
        setFormData((prev) => ({
            ...prev,
            courseName: paymentDetails.courseName || prev.courseName || ''
        }));
    }, [paymentDetails.courseName]);

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
            subtitle: 'Powered by Stripe Checkout'
        },
        { id: 'bank', name: 'Bank transfer', icon: 'fas fa-university', subtitle: 'Manual payment' }
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (paymentMethod === 'stripe') {
            if (!selectedCourse?._id) {
                alert('Please select a course from the list.');
                return;
            }
            if (resolvedAmount <= 0) {
                alert('This course has no charge. Contact us to enroll.');
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
                        ...(userId ? { userId: String(userId) } : {})
                    })
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
                alert(error.message || 'Checkout failed');
                setCheckoutLoading(false);
            }
            return;
        }

        if (paymentMethod === 'bank') {
            try {
                const response = await fetch(`${API_BASE_URL}/api/payments/register-online`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        studentName: formData.studentName,
                        email: formData.email,
                        courseName: formData.courseName || paymentDetails.courseName || 'Selected Course',
                        amount: resolvedAmount,
                        paymentMethod: 'bank'
                    })
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Failed to submit');
                }

                alert(
                    data.message ||
                        'Bank transfer request saved. We will confirm payment and update your status.'
                );
                setFormData({
                    studentName: '',
                    phone: '',
                    email: '',
                    courseName: paymentDetails.courseName || ''
                });
            } catch (error) {
                alert(`Submission failed: ${error.message}`);
            }
        }
    };

    const formattedFeePlan =
        paymentDetails.feePlan === 'per-month' ? 'Per Month' : paymentDetails.feePlan;
    const usdAmount = resolvedAmount;
    const localizedAmount = formatFromUsd(usdAmount);
    const shouldShowApprox = currency !== baseCurrency;

    return (
        <section className="payment-page scheme_dark">
            <div className="payment-gateway">
                <div className="payment-shell">
                    <div className="payment-header">
                        <h1>Course Registration</h1>
                        <p>Pay online with Stripe or request bank transfer instructions.</p>
                    </div>

                    <div className="payment-summary-banner">
                        <span className="payment-summary-course">
                            {formData.courseName || paymentDetails.courseName || 'Select a course'}
                        </span>
                        <strong>Total Amount: {localizedAmount}</strong>
                    </div>

                    <form className="payment-form" onSubmit={handleSubmit}>
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
                                <label>Student/Parent Phone Number *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. +31-6-1234567"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                                            courseName: e.target.value
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
                                            You will be redirected to Stripe to pay. Depending on your device and
                                            region, you may see Apple Pay, Google Pay, Link, and other options enabled
                                            for your account in the Stripe Dashboard.
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
                                <div className="paypal-info payment-bank-info">
                                    <h3>Bank transfer</h3>
                                    <p>{BANK_TRANSFER_NOTE}</p>
                                    <p className="payment-bank-contact">
                                        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="payment-footer-row">
                            <div className="payment-security">
                                <i className="fas fa-lock"></i>
                                <span>
                                    {paymentMethod === 'stripe' ? 'Stripe secure checkout' : 'Encrypted form'}
                                </span>
                            </div>

                            <div className="payment-footer-actions">
                                <Link to="/courses" className="back-to-courses-btn">
                                    <span className="back-arrow">←</span>
                                    <span>Back to All Courses</span>
                                </Link>
                                <button type="submit" className="pay-now-btn" disabled={checkoutLoading}>
                                    <i className="fas fa-credit-card"></i>{' '}
                                    {paymentMethod === 'stripe'
                                        ? checkoutLoading
                                            ? 'Redirecting…'
                                            : `Continue to Stripe (${localizedAmount})`
                                        : `Submit bank transfer request (${localizedAmount})`}
                                </button>
                            </div>
                        </div>

                        <p className="payment-note">
                            Fee plan: {formattedFeePlan}. By continuing, you agree to our terms and privacy policy.
                        </p>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default PaymentGateway;
