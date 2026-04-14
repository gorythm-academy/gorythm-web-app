import React from 'react';
import { Link } from 'react-router-dom';
import './PaymentResult.scss';

export function PaymentCancel() {
  return (
    <section className="payment-result-page scheme_dark">
      <div className="payment-result-card">
        <h1>Payment cancelled</h1>
        <p>No charge was made. You can return to the payment page anytime to try again.</p>
        <div className="payment-result-actions">
          <Link to="/payment" className="payment-result-link">
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
