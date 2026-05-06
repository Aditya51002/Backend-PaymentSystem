import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function PaymentHistory({ refreshToken, compact = false }) {
  const [userId, setUserId] = useState('');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadPayments(filterUserId = userId) {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: '1',
        limit: compact ? '5' : '10',
      });

      if (filterUserId.trim()) {
        params.set('userId', filterUserId.trim());
      }

      const response = await fetch(`${API_BASE}/api/payments?${params.toString()}`);
      const body = await response.json();

      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Payment history failed');
      }

      setPayments(body.data.payments);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
  }, [refreshToken, compact]);

  function submitFilter(event) {
    event.preventDefault();
    loadPayments(userId);
  }

  return (
    <div>
      <h2>{compact ? 'Recent Payments' : 'History'}</h2>
      <form className="history-tools" onSubmit={submitFilter}>
        <div className="field">
          <label htmlFor={compact ? 'compactUserId' : 'historyUserId'}>User ID</label>
          <input
            id={compact ? 'compactUserId' : 'historyUserId'}
            name="userId"
            onChange={(event) => setUserId(event.target.value)}
            type="text"
            value={userId}
          />
        </div>
        <button className="primary" type="submit">
          {loading ? <span className="spinner" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
          Search
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Retries</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.paymentId}>
                <td className="mono">{payment.paymentId}</td>
                <td>
                  {payment.amount} {payment.currency}
                </td>
                <td>
                  <span className={`badge ${payment.status}`}>{payment.status}</span>
                </td>
                <td>{payment.retryCount}</td>
                <td>{formatDate(payment.createdAt)}</td>
              </tr>
            ))}
            {!payments.length && (
              <tr>
                <td colSpan="5">{loading ? <RefreshCw size={16} aria-hidden="true" /> : 'No payments found.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PaymentHistory;
