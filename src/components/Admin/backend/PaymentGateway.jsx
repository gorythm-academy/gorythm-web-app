import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './PaymentGateway.scss';

const PaymentGateway = () => {
    const location = useLocation();
    const [paymentMethod, setPaymentMethod] = useState('card');
    const [formData, setFormData] = useState({
        studentName: '',
        phone: '',
        cardNumber: '',
        expiry: '',
        cvv: '',
        cardName: '',
        amount: '',
        email: ''
    });

    const paymentDetails = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const courseName = params.get('courseName') || 'Selected Course';
        const amount = params.get('amount') || '0';
        const feePlan = params.get('feePlan') || 'one-time';
        return { courseName, amount, feePlan };
    }, [location.search]);

    const [conversionRate, setConversionRate] = useState(null);
    const [rateDate, setRateDate] = useState('');

    useEffect(() => {
        let cancelled = false;
        const fetchRate = async () => {
            try {
                const res = await fetch('https://open.er-api.com/v6/latest/USD');
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const rate = data?.rates?.PKR;
                if (typeof rate === 'number' && rate > 0) {
                    setConversionRate(rate);
                }
                if (data?.date) {
                    setRateDate(data.date);
                }
            } catch {
                // Ignore; leave conversionRate as null so we don't show stale values
            }
        };
        fetchRate();
        return () => {
            cancelled = true;
        };
    }, []);

    const paymentMethods = [
        { id: 'card', name: 'Credit/Debit Card', icon: 'fas fa-credit-card' },
        { id: 'paypal', name: 'PayPal', icon: 'fab fa-paypal' },
        { id: 'jazzcash', name: 'JazzCash', icon: 'fas fa-mobile-alt' },
        { id: 'easypaisa', name: 'EasyPaisa', icon: 'fas fa-wallet' },
        { id: 'bank', name: 'Bank Transfer', icon: 'fas fa-university' }
    ];

    const handleSubmit = (e) => {
        e.preventDefault();
        // Payment processing logic here
        console.log('Processing payment:', { paymentMethod, formData, paymentDetails });
    };

    const formattedFeePlan =
        paymentDetails.feePlan === 'per-month' ? 'Per Month' : paymentDetails.feePlan;
    const usdAmount = Number(paymentDetails.amount) || 0;
    const hasConversionRate = typeof conversionRate === 'number' && conversionRate > 0;
    const pkrAmount = hasConversionRate ? usdAmount * conversionRate : 0;

    return (
        <section className="payment-page scheme_dark">
            <div className="payment-gateway">
                <div className="payment-shell">
                    <div className="payment-header">
                        <h1>Course Registration</h1>
                        <p>Complete your registration and payment to start learning.</p>
                    </div>

                    <div className="payment-summary-banner">
                        <span className="payment-summary-course">{paymentDetails.courseName}</span>
                        <strong>Total Amount: ${paymentDetails.amount}</strong>
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
                        </div>

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
                                        <span>{method.name}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="payment-brand-row" aria-hidden="true">
                                <span>Pay securely with card</span>
                                <div className="payment-brand-icons">
                                    <span>AMEX</span>
                                    <span>MC</span>
                                    <span>VISA</span>
                                </div>
                            </div>
                        </div>

                        <div className="payment-panel">
                            {paymentMethod === 'card' ? (
                                <>
                                    <div className="payment-panel-header">
                                        <h3>Credit Card Payment</h3>
                                        <p>Pay securely using your debit or credit card.</p>
                                    </div>

                                    <div className="payment-details-box">
                                        <h4>Payment Details:</h4>
                                        <div className="payment-detail-line">
                                            <span>Amount (USD):</span>
                                            <strong>${usdAmount.toFixed(2)}</strong>
                                        </div>
                                        {hasConversionRate && (
                                            <>
                                                <div className="payment-detail-line">
                                                    <span>
                                                        Conversion Rate
                                                        {rateDate ? ` (${rateDate})` : ''}:
                                                    </span>
                                                    <strong>1 USD = {conversionRate.toFixed(2)} PKR</strong>
                                                </div>
                                                <div className="payment-detail-line">
                                                    <span>Amount (PKR):</span>
                                                    <strong>
                                                        PKR{' '}
                                                        {pkrAmount.toLocaleString(undefined, {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </strong>
                                                </div>
                                            </>
                                        )}
                                        <p className="payment-detail-note">
                                            * The PKR amount is approximate and based on the current exchange rate.
                                        </p>
                                    </div>

                                    <div className="card-fields">
                                        <div className="form-group">
                                            <label>Card Number</label>
                                            <input
                                                type="text"
                                                placeholder="1234 5678 9012 3456"
                                                maxLength="19"
                                                value={formData.cardNumber}
                                                onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })}
                                            />
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Expiry Date</label>
                                                <input
                                                    type="text"
                                                    placeholder="MM/YY"
                                                    value={formData.expiry}
                                                    onChange={(e) => setFormData({ ...formData, expiry: e.target.value })}
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>CVV</label>
                                                <input
                                                    type="password"
                                                    placeholder="123"
                                                    maxLength="4"
                                                    value={formData.cvv}
                                                    onChange={(e) => setFormData({ ...formData, cvv: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Cardholder Name</label>
                                            <input
                                                type="text"
                                                placeholder="Name on card"
                                                value={formData.cardName}
                                                onChange={(e) => setFormData({ ...formData, cardName: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <button type="button" className="paypal-btn">
                                        <i className="fas fa-credit-card"></i> Pay with Card
                                    </button>
                                </>
                            ) : (
                                <div className="paypal-info">
                                    <h3>{paymentMethods.find((method) => method.id === paymentMethod)?.name}</h3>
                                    <p>
                                        This payment option can be connected next. For now, the page keeps the same
                                        registration design and amount summary for the selected course.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="payment-footer-row">
                            <div className="payment-security">
                                <i className="fas fa-lock"></i>
                                <span>Secure Payment</span>
                            </div>

                            <div className="payment-footer-actions">
                                <Link to="/courses" className="back-to-courses-btn">
                                    <span className="back-arrow">←</span>
                                    <span>Back to All Courses</span>
                                </Link>
                                <button type="submit" className="pay-now-btn">
                                    <i className="fas fa-credit-card"></i> Complete Payment (${paymentDetails.amount})
                                </button>
                            </div>
                        </div>

                        <p className="payment-note">
                            Fee plan: {formattedFeePlan}. By completing this payment, you agree to our terms and privacy policy.
                        </p>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default PaymentGateway;