import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import './PaymentResult.scss';

export function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [state, setState] = useState({
    loading: true,
    paid: false,
    enrolled: false,
    courseTitle: null,
    message: null,
    error: null,
  });

  useEffect(() => {
    if (!sessionId) {
      setState({
        loading: false,
        paid: false,
        enrolled: false,
        courseTitle: null,
        message: null,
        error: 'Missing session.',
      });
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/payments/verify-session?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setState({
            loading: false,
            paid: false,
            enrolled: false,
            courseTitle: null,
            message: null,
            error: data.error || 'Could not verify payment.',
          });
          return;
        }
        setState({
          loading: false,
          paid: !!data.paid,
          enrolled: !!data.enrolled,
          courseTitle: data.courseTitle,
          message: data.message || null,
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            loading: false,
            paid: false,
            enrolled: false,
            courseTitle: null,
            message: null,
            error: 'Could not verify payment.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <section className="payment-result-page scheme_dark">
      <div className="payment-result-card">
        {state.loading ? (
          <p>Verifying your payment…</p>
        ) : state.error ? (
          <>
            <h1>Could not confirm payment</h1>
            <p>{state.error}</p>
            <Link to="/contact" className="payment-result-link">
              Contact support
            </Link>
          </>
        ) : state.enrolled ? (
          <>
            <h1>Thank you</h1>
            <p>Your payment was received successfully.</p>
            {state.courseTitle ? <p className="payment-result-course">{state.courseTitle}</p> : null}
            {state.message ? (
              <p className="payment-result-note">{state.message}</p>
            ) : (
              <p className="payment-result-note">
                You will receive a confirmation email shortly. If anything looks wrong, contact us.
              </p>
            )}
            <Link to="/courses" className="payment-result-link">
              Back to courses
            </Link>
          </>
        ) : state.paid ? (
          <>
            <h1>Payment received — action needed</h1>
            <p>
              {state.message ||
                'We received your payment but could not complete enrollment automatically. Please contact us with your receipt.'}
            </p>
            {state.courseTitle ? <p className="payment-result-course">{state.courseTitle}</p> : null}
            <Link to="/contact" className="payment-result-link">
              Contact support
            </Link>
          </>
        ) : (
          <>
            <h1>Payment pending</h1>
            <p>We could not confirm a paid payment yet. If you were charged, contact support with your receipt.</p>
            <Link to="/contact" className="payment-result-link">
              Contact support
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
