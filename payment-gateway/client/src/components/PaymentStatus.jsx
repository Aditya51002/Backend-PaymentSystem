import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const FINAL_STATUSES = ['success', 'failed'];

function formatDate(value) {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function PaymentStatus({ paymentId, onPaymentIdChange }) {
  const [lookupId, setLookupId] = useState(paymentId || '');
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLookupId(paymentId || '');
  }, [paymentId]);

  async function fetchPayment(id) {
    if (!id) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/payments/${id}`);
      const body = await response.json();

      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Payment lookup failed');
      }

      setPayment(body.data);
    } catch (requestError) {
      setError(requestError.message);
      setPayment(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!paymentId) {
      return undefined;
    }

    let cancelled = false;

    async function poll() {
      if (cancelled) {
        return;
      }
      await fetchPayment(paymentId);
    }

    poll();
    const timer = setInterval(async () => {
      if (!cancelled && !FINAL_STATUSES.includes(payment?.status)) {
        await fetchPayment(paymentId);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [paymentId, payment?.status]);

  function submitLookup(event) {
    event.preventDefault();
    onPaymentIdChange(lookupId.trim());
  }

  return (
    <div>
      <h2>Status</h2>
      <form className="history-tools" onSubmit={submitLookup}>
        <div className="field">
          <label htmlFor="paymentLookup">Payment ID</label>
          <input
            id="paymentLookup"
            name="paymentLookup"
            onChange={(event) => setLookupId(event.target.value)}
            type="text"
            value={lookupId}
          />
        </div>
        <button className="primary" type="submit">
          <Search size={17} aria-hidden="true" />
          Find
        </button>
      </form>

      {loading && (
        <p>
          <RefreshCw size={16} aria-hidden="true" /> Loading
        </p>
      )}
      {error && <div className="error">{error}</div>}
      {!payment && !error && <p>No payment selected.</p>}

      {payment && (
        <div className="status-grid">
          <div className="metric">
            <span>Status</span>
            <strong className={`badge ${payment.status}`}>{payment.status}</strong>
          </div>
          <div className="metric">
            <span>Amount</span>
            <strong>
              {payment.amount} {payment.currency}
            </strong>
          </div>
          <div className="metric">
            <span>Retry Count</span>
            <strong>{payment.retryCount}</strong>
          </div>
          <div className="metric">
            <span>Payment ID</span>
            <strong className="mono">{payment.paymentId}</strong>
          </div>
          <div className="metric">
            <span>Created</span>
            <strong>{formatDate(payment.createdAt)}</strong>
          </div>
          <div className="metric">
            <span>Updated</span>
            <strong>{formatDate(payment.updatedAt)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentStatus;
