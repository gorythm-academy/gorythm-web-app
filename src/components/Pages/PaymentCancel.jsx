import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { readPaymentCourseId } from '../../utils/paymentCourseContext';
import './PaymentResult.scss';

export function PaymentCancel() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') || readPaymentCourseId();
  const paymentHref = courseId
    ? `/payment?courseId=${encodeURIComponent(courseId)}`
    : '/payment';

  return (
    <section className="payment-result-page scheme_dark">
      <div className="payment-result-card">
        <h1>Payment cancelled</h1>
        <p>No charge was made. You can return to the payment page anytime to try again.</p>
        <div className="payment-result-actions">
          <Link to={paymentHref} className="payment-result-link">
            Return to payment
          </Link>
          <Link to="/courses" className="payment-result-link payment-result-link--secondary">
            Browse courses
          </Link>
        </div>
      </div>
    </section>
  );
}
