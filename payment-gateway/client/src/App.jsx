import { useState } from 'react';
import { CreditCard, History, Search } from 'lucide-react';
import PaymentForm from './components/PaymentForm.jsx';
import PaymentStatus from './components/PaymentStatus.jsx';
import PaymentHistory from './components/PaymentHistory.jsx';

const styles = `
:root {
  color: #17202a;
  background: #f4f7f4;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

.shell {
  min-height: 100vh;
  background:
    linear-gradient(120deg, rgba(18, 119, 97, 0.10), transparent 34%),
    linear-gradient(290deg, rgba(212, 94, 44, 0.12), transparent 38%),
    #f4f7f4;
}

.topbar {
  align-items: center;
  background: #0e2b2a;
  color: #fff;
  display: flex;
  gap: 14px;
  justify-content: space-between;
  min-height: 66px;
  padding: 14px clamp(16px, 4vw, 42px);
}

.brand {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.brand h1 {
  font-size: 1.05rem;
  letter-spacing: 0;
  margin: 0;
  white-space: nowrap;
}

.tabs {
  align-items: center;
  display: flex;
  gap: 6px;
}

.tab {
  align-items: center;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.20);
  border-radius: 8px;
  color: #dbe8e3;
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  min-height: 38px;
  padding: 8px 12px;
}

.tab.active {
  background: #ffffff;
  color: #0e2b2a;
}

.content {
  display: grid;
  gap: 22px;
  grid-template-columns: minmax(290px, 390px) 1fr;
  margin: 0 auto;
  max-width: 1180px;
  padding: clamp(18px, 4vw, 42px);
}

.panel,
.card {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid #d7e0db;
  border-radius: 8px;
  box-shadow: 0 16px 38px rgba(20, 42, 39, 0.08);
}

.panel {
  padding: 20px;
}

.panel h2 {
  font-size: 1rem;
  margin: 0 0 16px;
}

.form {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 6px;
}

.field label {
  color: #41514d;
  font-size: 0.85rem;
  font-weight: 650;
}

.field input,
.field select {
  background: #fff;
  border: 1px solid #bfccc6;
  border-radius: 8px;
  color: #17202a;
  min-height: 42px;
  padding: 9px 11px;
  width: 100%;
}

.primary {
  align-items: center;
  background: #137761;
  border: 0;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  justify-content: center;
  min-height: 44px;
  padding: 10px 14px;
}

.primary:disabled {
  cursor: wait;
  opacity: 0.72;
}

.spinner {
  animation: spin 0.8s linear infinite;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  height: 16px;
  width: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  background: #fff0ed;
  border: 1px solid #efb7aa;
  border-radius: 8px;
  color: #a23c26;
  padding: 10px 12px;
}

.status-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metric {
  background: #f8faf8;
  border: 1px solid #e0e7e3;
  border-radius: 8px;
  padding: 12px;
}

.metric span {
  color: #63716c;
  display: block;
  font-size: 0.78rem;
  margin-bottom: 4px;
}

.metric strong {
  word-break: break-word;
}

.badge {
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 750;
  line-height: 1;
  padding: 7px 10px;
  text-transform: uppercase;
}

.badge.pending {
  background: #e9edf0;
  color: #4a5961;
}

.badge.processing {
  background: #fff3c4;
  color: #8b5d00;
}

.badge.success {
  background: #dff5e8;
  color: #137245;
}

.badge.failed {
  background: #ffe0dc;
  color: #a33624;
}

.history-tools {
  align-items: end;
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr auto;
  margin-bottom: 14px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  border-collapse: collapse;
  min-width: 680px;
  width: 100%;
}

th,
td {
  border-bottom: 1px solid #e0e7e3;
  padding: 11px 10px;
  text-align: left;
  vertical-align: middle;
}

th {
  color: #50605b;
  font-size: 0.78rem;
  text-transform: uppercase;
}

td {
  font-size: 0.92rem;
}

.mono {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.82rem;
}

@media (max-width: 840px) {
  .content {
    grid-template-columns: 1fr;
  }

  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 520px) {
  .tabs {
    width: 100%;
  }

  .tab {
    flex: 1;
    justify-content: center;
  }

  .status-grid,
  .history-tools {
    grid-template-columns: 1fr;
  }
}
`;

function App() {
  const [activeTab, setActiveTab] = useState('new');
  const [paymentId, setPaymentId] = useState('');
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  function handleCreated(createdPaymentId) {
    setPaymentId(createdPaymentId);
    setActiveTab('status');
    setHistoryRefreshToken((value) => value + 1);
  }

  return (
    <div className="shell">
      <style>{styles}</style>
      <header className="topbar">
        <div className="brand">
          <CreditCard size={24} aria-hidden="true" />
          <h1>Payment Gateway</h1>
        </div>
        <nav className="tabs" aria-label="Dashboard views">
          <button
            className={`tab ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
            type="button"
          >
            <CreditCard size={16} aria-hidden="true" />
            New
          </button>
          <button
            className={`tab ${activeTab === 'status' ? 'active' : ''}`}
            onClick={() => setActiveTab('status')}
            type="button"
          >
            <Search size={16} aria-hidden="true" />
            Status
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            type="button"
          >
            <History size={16} aria-hidden="true" />
            History
          </button>
        </nav>
      </header>

      <main className="content">
        <section className="panel">
          <h2>Payment</h2>
          <PaymentForm onCreated={handleCreated} />
        </section>

        <section className="panel">
          {activeTab === 'new' && <PaymentHistory refreshToken={historyRefreshToken} compact />}
          {activeTab === 'status' && (
            <PaymentStatus paymentId={paymentId} onPaymentIdChange={setPaymentId} />
          )}
          {activeTab === 'history' && <PaymentHistory refreshToken={historyRefreshToken} />}
        </section>
      </main>
    </div>
  );
}

export default App;
