import { useState } from 'react';
import { Send } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

function createIdempotencyKey() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function PaymentForm({ onCreated }) {
  const [form, setForm] = useState({
    amount: '',
    currency: 'USD',
    userId: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function submitPayment(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': createIdempotencyKey(),
        },
        body: JSON.stringify({
          amount: Number(form.amount),
          currency: form.currency,
          userId: form.userId,
        }),
      });
      const body = await response.json();

      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Payment request failed');
      }

      setForm({
        amount: '',
        currency: 'USD',
        userId: form.userId,
      });
      onCreated(body.data.paymentId);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={submitPayment}>
      <div className="field">
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          min="0.01"
          name="amount"
          onChange={updateField}
          required
          step="0.01"
          type="number"
          value={form.amount}
        />
      </div>

      <div className="field">
        <label htmlFor="currency">Currency</label>
        <select id="currency" name="currency" onChange={updateField} value={form.currency}>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="INR">INR</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="userId">User ID</label>
        <input
          id="userId"
          name="userId"
          onChange={updateField}
          required
          type="text"
          value={form.userId}
        />
      </div>

      {error && <div className="error">{error}</div>}

      <button className="primary" disabled={submitting} type="submit">
        {submitting ? <span className="spinner" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
        Submit
      </button>
    </form>
  );
}

export default PaymentForm;
