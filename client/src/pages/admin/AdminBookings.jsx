import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/client';

const STATUSES = ['pending', 'confirmed', 'cancelled', 'checked-in', 'completed'];
const PAY_STATUSES = ['unpaid', 'partial', 'paid', 'refunded', 'failed'];
const METHODS = ['cash', 'upi', 'card', 'bank', 'other'];

const inr = (n) => `\u20b9${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const resizeOcc = (occ, n) => {
  const count = Math.max(1, Math.min(50, Number(n) || 1));
  const out = occ.slice(0, count);
  while (out.length < count) out.push({ type: out[out.length - 1]?.type || 'single' });
  return out;
};

// One row per room: single or double occupancy (this is what drives the tariff).
function OccupancyRows({ occ, onChange }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {occ.map((o, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 10, alignItems: 'end', background: '#faf9f6', padding: '8px 10px', borderRadius: 6 }}>
          <strong style={{ fontSize: 13, paddingBottom: 8 }}>Room {i + 1}</strong>
          <div>
            <label style={label}>Occupancy</label>
            <select style={input} value={o.type} onChange={(e) => onChange(occ.map((x, idx) => (idx === i ? { type: e.target.value } : x)))}>
              <option value="single">Single</option>
              <option value="double">Double</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

const balanceOf = (b) => b.totalAmount - (b.amountPaid - b.amountRefunded);

const STATUS_COLORS = {
  pending: '#e67e22',
  confirmed: '#2e7d32',
  cancelled: '#999',
  'checked-in': '#2980b9',
  completed: '#555',
};
const PAY_COLORS = { unpaid: '#c0392b', partial: '#e67e22', paid: '#2e7d32', refunded: '#8e44ad', failed: '#c0392b' };

function Badge({ text, color }) {
  return (
    <span style={{ background: color, color: '#fff', borderRadius: 10, padding: '2px 9px', fontSize: 11, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

export default function AdminBookings() {
  const [tab, setTab] = useState('list'); // list | calendar
  const [bookings, setBookings] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', paymentStatus: '', from: '', to: '' });
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => v && (params[k] = v));
    const { data } = await api.get('/bookings', { params });
    setBookings(data.data);
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(() => load().catch((err) => setError(err.message)), 250);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0 }}>Bookings</h1>
        <button type="button" style={btnPrimary} onClick={() => setShowNew(true)}>+ New booking</button>
      </div>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      <div style={{ margin: '16px 0', display: 'flex', gap: 8 }}>
        <button type="button" style={tab === 'list' ? btnPrimary : btnSecondary} onClick={() => setTab('list')}>All bookings</button>
        <button type="button" style={tab === 'calendar' ? btnPrimary : btnSecondary} onClick={() => setTab('calendar')}>Availability calendar</button>
      </div>

      {tab === 'list' && (
        <>
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div>
              <label style={label}>Search</label>
              <input style={input} placeholder="Ref, name, phone, email" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
            </div>
            <div>
              <label style={label}>Status</label>
              <select style={input} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">All</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Payment</label>
              <select style={input} value={filters.paymentStatus} onChange={(e) => setFilter('paymentStatus', e.target.value)}>
                <option value="">All</option>
                {PAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Check-in from</label>
              <input type="date" style={input} value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            </div>
            <div>
              <label style={label}>Check-in to</label>
              <input type="date" style={input} value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', background: '#fff', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                  <th style={th}>Reference</th>
                  <th style={th}>Guest</th>
                  <th style={th}>Room</th>
                  <th style={th}>Stay</th>
                  <th style={th}>Total / Balance</th>
                  <th style={th}>Status</th>
                  <th style={th}>Payment</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b._id} style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }} onClick={() => setSelectedId(b._id)}>
                    <td style={td}>
                      <strong>{b.reference}</strong>
                      <br />
                      <span style={{ color: '#999', fontSize: 11 }}>{b.source === 'admin' ? 'Admin' : 'Website'}</span>
                    </td>
                    <td style={td}>
                      {b.guest.firstName} {b.guest.lastName}
                      <br />
                      <span style={{ color: '#888' }}>{b.guest.phone}</span>
                    </td>
                    <td style={td}>{b.room?.name} &times; {b.roomCount || 1}</td>
                    <td style={td}>
                      {fmtDate(b.checkIn)} &rarr; {fmtDate(b.checkOut)}
                      <br />
                      <span style={{ color: '#888' }}>{b.nights} night{b.nights > 1 ? 's' : ''}</span>
                    </td>
                    <td style={td}>
                      {inr(b.totalAmount)}
                      <br />
                      <span style={{ color: balanceOf(b) > 0.009 ? '#c0392b' : '#2e7d32' }}>
                        {balanceOf(b) > 0.009 ? `Due ${inr(balanceOf(b))}` : 'Settled'}
                      </span>
                    </td>
                    <td style={td}><Badge text={b.status} color={STATUS_COLORS[b.status]} /></td>
                    <td style={td}><Badge text={b.paymentStatus} color={PAY_COLORS[b.paymentStatus]} /></td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr><td style={td} colSpan={7}>No bookings found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#888', fontSize: 12 }}>Unpaid website bookings that are still <em>pending</em> release their rooms automatically after 15 minutes.</p>
        </>
      )}

      {tab === 'calendar' && <CalendarView refreshKey={refreshKey} onOpen={(id) => setSelectedId(id)} />}

      {selectedId && (
        <BookingDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
      {showNew && (
        <NewBooking
          onClose={() => setShowNew(false)}
          onCreated={(b) => {
            setShowNew(false);
            refresh();
            setSelectedId(b._id);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Calendar
function CalendarView({ refreshKey, onOpen }) {
  const [from, setFrom] = useState(todayISO());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cell, setCell] = useState(null); // { roomId, date }
  const DAYS = 31;

  useEffect(() => {
    let active = true;
    api
      .get('/bookings/calendar', { params: { from, days: DAYS } })
      .then(({ data: res }) => active && setData(res.data))
      .catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, [from, refreshKey]);

  const shift = (n) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    setFrom(d.toISOString().slice(0, 10));
  };

  const cellBookings = useMemo(() => {
    if (!data || !cell) return [];
    const day = new Date(`${cell.date}T00:00:00Z`).getTime();
    return data.bookings.filter(
      (b) => b.room?._id === cell.roomId && new Date(b.checkIn).getTime() <= day && new Date(b.checkOut).getTime() > day
    );
  }, [data, cell]);

  if (error) return <p style={{ color: '#c0392b' }}>{error}</p>;
  if (!data) return <p>Loading&hellip;</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" style={btnSecondary} onClick={() => shift(-DAYS)}>&larr; Prev</button>
        <input type="date" style={{ ...input, width: 160 }} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <button type="button" style={btnSecondary} onClick={() => setFrom(todayISO())}>Today</button>
        <button type="button" style={btnSecondary} onClick={() => shift(DAYS)}>Next &rarr;</button>
        <span style={{ fontSize: 12, color: '#777' }}>Each cell = rooms booked / total rooms for that night. Click a cell to see its bookings.</span>
      </div>
      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, position: 'sticky', left: 0, background: '#fff', minWidth: 130 }}>Room type</th>
              {data.dates.map((d) => (
                <th key={d} style={{ padding: '6px 4px', minWidth: 46, textAlign: 'center', fontWeight: 600 }}>
                  {new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit' })}
                  <div style={{ fontWeight: 400, color: '#888', fontSize: 10 }}>
                    {new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short' })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((r) => (
              <tr key={r._id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ ...td, position: 'sticky', left: 0, background: '#fff', fontWeight: 600 }}>
                  {r.name}
                  <div style={{ fontWeight: 400, color: '#888' }}>{r.totalUnits} rooms{r.status !== 'active' ? ` · ${r.status}` : ''}</div>
                </td>
                {data.dates.map((d, i) => {
                  const n = data.counts[r._id]?.[i] || 0;
                  const free = r.totalUnits - n;
                  const bg = n === 0 ? '#e8f5e9' : free <= 0 ? '#f8d7da' : '#fff3cd';
                  const selected = cell && cell.roomId === r._id && cell.date === d;
                  return (
                    <td
                      key={d}
                      onClick={() => setCell({ roomId: r._id, date: d })}
                      style={{
                        background: bg,
                        textAlign: 'center',
                        cursor: 'pointer',
                        padding: '8px 2px',
                        border: selected ? '2px solid #c9a24b' : '1px solid #fff',
                      }}
                      title={`${n} of ${r.totalUnits} booked`}
                    >
                      {n}/{r.totalUnits}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: '#777' }}>
        <span style={{ background: '#e8f5e9', padding: '2px 8px' }}>all free</span>{' '}
        <span style={{ background: '#fff3cd', padding: '2px 8px' }}>some booked</span>{' '}
        <span style={{ background: '#f8d7da', padding: '2px 8px' }}>sold out</span>
      </p>

      {cell && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>
            {data.rooms.find((r) => r._id === cell.roomId)?.name} &middot; night of {fmtDate(`${cell.date}T00:00:00Z`)}
          </h3>
          {cellBookings.length === 0 && <p style={{ color: '#777' }}>No bookings for this night.</p>}
          {cellBookings.map((b) => (
            <div key={b._id} onClick={() => onOpen(b._id)} style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0', cursor: 'pointer', fontSize: 13 }}>
              <strong>{b.reference}</strong> &middot; {b.guest.firstName} {b.guest.lastName} &middot; {b.roomCount || 1} room(s) &middot;{' '}
              {fmtDate(b.checkIn)} &rarr; {fmtDate(b.checkOut)} <Badge text={b.status} color={STATUS_COLORS[b.status]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Detail
function BookingDetail({ id, onClose, onChanged }) {
  const [b, setB] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(''); // '' | pay | refund | edit
  const [pay, setPay] = useState({ amount: '', method: 'cash', note: '' });
  const [refund, setRefund] = useState({ amount: '', mode: 'razorpay', note: '' });
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/bookings/${id}`);
    setB(data.data);
    return data.data;
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      if (res?.data?.data) setB(res.data.data);
      onChanged();
      setPanel('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setEdit({
      firstName: b.guest.firstName,
      lastName: b.guest.lastName,
      email: b.guest.email,
      phone: b.guest.phone,
      specialRequests: b.guest.specialRequests || '',
      checkIn: isoDay(b.checkIn),
      checkOut: isoDay(b.checkOut),
      occupancy: resizeOcc(
        (b.occupancy || []).map((o) => ({ type: o.type || 'single' })),
        b.roomCount || 1
      ),
      notes: b.notes || '',
    });
    setPanel('edit');
  };

  if (!b) {
    return (
      <Modal title="Booking" onClose={onClose}>
        {error ? <p style={{ color: '#c0392b' }}>{error}</p> : <p>Loading&hellip;</p>}
      </Modal>
    );
  }

  const net = b.amountPaid - b.amountRefunded;
  const balance = balanceOf(b);
  const hasRazorpay = b.payments.some((p) => p.method === 'razorpay');
  const closed = ['cancelled', 'completed'].includes(b.status);

  return (
    <Modal title={`Booking ${b.reference}`} onClose={onClose} wide>
      {error && <p style={{ color: '#c0392b', marginTop: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <select
          value={b.status}
          disabled={busy}
          onChange={(e) => run(() => api.put(`/bookings/${b._id}/status`, { status: e.target.value }))}
          style={{ ...input, width: 150 }}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Badge text={`payment: ${b.paymentStatus}`} color={PAY_COLORS[b.paymentStatus]} />
        <span style={{ color: '#999', fontSize: 12 }}>{b.source === 'admin' ? 'Created by admin' : 'Booked on website'} &middot; {new Date(b.createdAt).toLocaleString('en-IN')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, fontSize: 13 }}>
        <div>
          <h4 style={h4}>Guest</h4>
          {b.guest.firstName} {b.guest.lastName}<br />
          {b.guest.phone}<br />
          {b.guest.email || <span style={{ color: '#999' }}>no email</span>}
          {b.guest.specialRequests && <p style={{ margin: '6px 0 0' }}><em>&ldquo;{b.guest.specialRequests}&rdquo;</em></p>}
        </div>
        <div>
          <h4 style={h4}>Stay</h4>
          {b.room?.name} &times; {b.roomCount || 1}<br />
          {fmtDate(b.checkIn)} &rarr; {fmtDate(b.checkOut)} ({b.nights} night{b.nights > 1 ? 's' : ''})<br />
          {b.occupancy?.length > 0 && (
            <div style={{ color: '#777', marginTop: 4 }}>
              {b.occupancy.map((o, i) => <div key={i}>Room {i + 1}: {o.type === 'double' ? 'Double' : 'Single'} occupancy</div>)}
            </div>
          )}
        </div>
        <div>
          <h4 style={h4}>Amount</h4>
          Tariff: {inr(b.subtotal || b.totalAmount)}<br />
          {b.taxAmount > 0 && <>Tax ({b.taxPercent}%): {inr(b.taxAmount)}<br /></>}
          <strong>Total: {inr(b.totalAmount)}</strong><br />
          Paid: {inr(b.amountPaid)}{b.amountRefunded > 0 && <> &middot; Refunded: {inr(b.amountRefunded)}</>}<br />
          <strong style={{ color: balance > 0.009 ? '#c0392b' : '#2e7d32' }}>
            {balance > 0.009 ? `Balance due: ${inr(balance)}` : net - b.totalAmount > 0.009 ? `Overpaid by ${inr(net - b.totalAmount)}` : 'Fully settled'}
          </strong>
        </div>
      </div>

      {(b.payments.length > 0 || b.refunds.length > 0) && (
        <>
          <h4 style={h4}>Payment history</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {b.payments.map((p) => (
                <tr key={p._id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={td}>{new Date(p.at).toLocaleString('en-IN')}</td>
                  <td style={td}>+ {inr(p.amount)}</td>
                  <td style={td}>{p.method}{p.razorpayPaymentId ? ` (${p.razorpayPaymentId})` : ''}</td>
                  <td style={td}>{p.note}</td>
                </tr>
              ))}
              {b.refunds.map((r) => (
                <tr key={r._id} style={{ borderTop: '1px solid #f0f0f0', color: '#8e44ad' }}>
                  <td style={td}>{new Date(r.at).toLocaleString('en-IN')}</td>
                  <td style={td}>&minus; {inr(r.amount)}</td>
                  <td style={td}>refund ({r.method}){r.razorpayRefundId ? ` ${r.razorpayRefundId}` : ''}</td>
                  <td style={td}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {b.notes && (
        <>
          <h4 style={h4}>Internal notes</h4>
          <p style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{b.notes}</p>
        </>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={btnSecondary} onClick={startEdit} disabled={busy}>Edit booking</button>
        <button type="button" style={btnSecondary} onClick={() => { setPay({ amount: balance > 0 ? balance.toFixed(2) : '', method: 'cash', note: '' }); setPanel('pay'); }}>Record payment</button>
        {net > 0.009 && (
          <button
            type="button"
            style={btnSecondary}
            onClick={() => { setRefund({ amount: net.toFixed(2), mode: hasRazorpay ? 'razorpay' : 'manual', note: '' }); setPanel('refund'); }}
          >
            Refund
          </button>
        )}
        {!closed && (
          <button
            type="button"
            style={btnDanger}
            disabled={busy}
            onClick={() => window.confirm('Cancel this booking and free its rooms?') && run(() => api.put(`/bookings/${b._id}/status`, { status: 'cancelled' }))}
          >
            Cancel booking
          </button>
        )}
      </div>

      {panel === 'pay' && (
        <form
          style={subCard}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.post(`/bookings/${b._id}/payments`, { ...pay, amount: Number(pay.amount) }));
          }}
        >
          <h4 style={{ ...h4, marginTop: 0 }}>Record a payment received at the hotel</h4>
          <div style={grid3}>
            <div><label style={label}>Amount (&#8377;)</label><input style={input} type="number" min="0.01" step="0.01" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
            <div><label style={label}>Method</label>
              <select style={input} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </div>
            <div><label style={label}>Note</label><input style={input} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></div>
          </div>
          <button type="submit" style={{ ...btnPrimary, marginTop: 10 }} disabled={busy}>Save payment</button>
          <button type="button" style={btnSecondary} onClick={() => setPanel('')}>Close</button>
        </form>
      )}

      {panel === 'refund' && (
        <form
          style={subCard}
          onSubmit={(e) => {
            e.preventDefault();
            if (!window.confirm(`Refund ${inr(refund.amount)}${refund.mode === 'razorpay' ? ' via Razorpay? This cannot be undone.' : ' (recorded manually)?'}`)) return;
            run(() => api.post(`/bookings/${b._id}/refund`, { ...refund, amount: Number(refund.amount) }));
          }}
        >
          <h4 style={{ ...h4, marginTop: 0 }}>Refund (max {inr(net)})</h4>
          <div style={grid3}>
            <div><label style={label}>Amount (&#8377;)</label><input style={input} type="number" min="0.01" step="0.01" max={net} required value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></div>
            <div><label style={label}>How</label>
              <select style={input} value={refund.mode} onChange={(e) => setRefund({ ...refund, mode: e.target.value })}>
                <option value="razorpay" disabled={!hasRazorpay}>Back to customer via Razorpay</option>
                <option value="manual">Manual (cash / already returned)</option>
              </select>
            </div>
            <div><label style={label}>Note</label><input style={input} value={refund.note} onChange={(e) => setRefund({ ...refund, note: e.target.value })} /></div>
          </div>
          <button type="submit" style={{ ...btnPrimary, marginTop: 10 }} disabled={busy}>{busy ? 'Processing...' : 'Issue refund'}</button>
          <button type="button" style={btnSecondary} onClick={() => setPanel('')}>Close</button>
        </form>
      )}

      {panel === 'edit' && edit && (
        <form
          style={subCard}
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              api.put(`/bookings/${b._id}`, {
                guest: { firstName: edit.firstName, lastName: edit.lastName, email: edit.email, phone: edit.phone, specialRequests: edit.specialRequests },
                notes: edit.notes,
                ...(closed
                  ? {}
                  : {
                      checkIn: edit.checkIn,
                      checkOut: edit.checkOut,
                      occupancy: edit.occupancy,
                    }),
              })
            );
          }}
        >
          <h4 style={{ ...h4, marginTop: 0 }}>Edit booking</h4>
          <div style={grid3}>
            <div><label style={label}>First name</label><input style={input} required value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} /></div>
            <div><label style={label}>Last name</label><input style={input} value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} /></div>
            <div><label style={label}>Phone</label><input style={input} required value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            <div><label style={label}>Email</label><input style={input} type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            {!closed && (
              <>
                <div><label style={label}>Check-in</label><input style={input} type="date" required value={edit.checkIn} onChange={(e) => setEdit({ ...edit, checkIn: e.target.value })} /></div>
                <div><label style={label}>Check-out</label><input style={input} type="date" required value={edit.checkOut} onChange={(e) => setEdit({ ...edit, checkOut: e.target.value })} /></div>
                <div><label style={label}>Number of rooms</label><input style={input} type="number" min="1" max="50" value={edit.occupancy.length} onChange={(e) => setEdit({ ...edit, occupancy: resizeOcc(edit.occupancy, e.target.value) })} /></div>
              </>
            )}
          </div>
          {!closed && (
            <OccupancyRows occ={edit.occupancy} onChange={(occupancy) => setEdit({ ...edit, occupancy })} />
          )}
          <div style={{ marginTop: 10 }}><label style={label}>Special requests</label><input style={input} value={edit.specialRequests} onChange={(e) => setEdit({ ...edit, specialRequests: e.target.value })} /></div>
          <div style={{ marginTop: 10 }}><label style={label}>Internal notes</label><textarea rows="2" style={input} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
          {!closed && <p style={{ fontSize: 12, color: '#777' }}>Changing dates or rooms re-prices the booking at today&apos;s tariff and re-checks availability.</p>}
          <button type="submit" style={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
          <button type="button" style={btnSecondary} onClick={() => setPanel('')}>Close</button>
        </form>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ New booking
function NewBooking({ onClose, onCreated }) {
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [quote, setQuote] = useState(null);
  const [f, setF] = useState({
    roomId: '',
    checkIn: todayISO(),
    checkOut: '',
    occupancy: [{ type: 'single' }],
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    specialRequests: '',
    status: 'confirmed',
    totalOverride: '',
    amountReceived: '',
    paymentMethod: 'cash',
    notes: '',
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api.get('/rooms').then(({ data }) => {
      setRooms(data.data);
      if (data.data[0]) setF((x) => ({ ...x, roomId: x.roomId || data.data[0]._id }));
    }).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!f.roomId || !f.checkIn || !f.checkOut || f.checkOut <= f.checkIn) { setQuote(null); return undefined; }
    let active = true;
    const t = setTimeout(() => {
      api.post('/bookings/quote', { roomId: f.roomId, checkIn: f.checkIn, checkOut: f.checkOut, occupancy: f.occupancy })
        .then(({ data }) => active && setQuote(data.data))
        .catch(() => active && setQuote(null));
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [f.roomId, f.checkIn, f.checkOut, JSON.stringify(f.occupancy)]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/bookings/manual', {
        roomId: f.roomId,
        checkIn: f.checkIn,
        checkOut: f.checkOut,
        occupancy: f.occupancy,
        guest: { firstName: f.firstName, lastName: f.lastName, phone: f.phone, email: f.email, specialRequests: f.specialRequests },
        status: f.status,
        totalOverride: f.totalOverride === '' ? undefined : Number(f.totalOverride),
        amountReceived: f.amountReceived === '' ? undefined : Number(f.amountReceived),
        paymentMethod: f.paymentMethod,
        notes: f.notes,
      });
      onCreated(data.data);
    } catch (err) {
      setError(err.errors?.[0]?.message ? `${err.message}: ${err.errors[0].field} — ${err.errors[0].message}` : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New booking" onClose={onClose} wide>
      <form onSubmit={submit}>
        {error && <p style={{ color: '#c0392b', marginTop: 0 }}>{error}</p>}
        <div style={grid3}>
          <div><label style={label}>Room type</label>
            <select style={input} required value={f.roomId} onChange={(e) => set('roomId', e.target.value)}>
              {rooms.map((r) => <option key={r._id} value={r._id}>{r.name} ({r.totalUnits} rooms)</option>)}
            </select>
          </div>
          <div><label style={label}>Check-in</label><input style={input} type="date" required value={f.checkIn} onChange={(e) => set('checkIn', e.target.value)} /></div>
          <div><label style={label}>Check-out</label><input style={input} type="date" required min={f.checkIn} value={f.checkOut} onChange={(e) => set('checkOut', e.target.value)} /></div>
          <div><label style={label}>Number of rooms</label><input style={input} type="number" min="1" max="50" value={f.occupancy.length} onChange={(e) => set('occupancy', resizeOcc(f.occupancy, e.target.value))} /></div>
        </div>
        <OccupancyRows occ={f.occupancy} onChange={(occupancy) => set('occupancy', occupancy)} />

        {quote && (
          <p style={{ fontSize: 13, margin: '10px 0', color: quote.available ? '#2e7d32' : '#c0392b' }}>
            {quote.available
              ? `Available (${quote.availableUnits} left) · ${quote.nights} night(s) · ${quote.pricing.lines.map((l) => `Room ${l.room}: ${inr(l.perNight)}/night`).join(', ')} · Tariff ${inr(quote.pricing.subtotal)}${quote.pricing.taxAmount ? ` + tax ${inr(quote.pricing.taxAmount)}` : ''} = ${inr(quote.pricing.totalAmount)}`
              : quote.message}
          </p>
        )}

        <h4 style={h4}>Guest</h4>
        <div style={grid3}>
          <div><label style={label}>First name</label><input style={input} required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
          <div><label style={label}>Last name</label><input style={input} value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
          <div><label style={label}>Phone</label><input style={input} required value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label style={label}>Email (optional)</label><input style={input} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 10 }}><label style={label}>Special requests</label><input style={input} value={f.specialRequests} onChange={(e) => set('specialRequests', e.target.value)} /></div>

        <h4 style={h4}>Status &amp; payment</h4>
        <div style={grid3}>
          <div><label style={label}>Status</label>
            <select style={input} value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.filter((s) => s !== 'cancelled').map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div><label style={label}>Custom total (&#8377;, optional)</label><input style={input} type="number" min="0" step="0.01" placeholder="Blank = standard tariff" value={f.totalOverride} onChange={(e) => set('totalOverride', e.target.value)} /></div>
          <div><label style={label}>Amount received now (&#8377;)</label><input style={input} type="number" min="0" step="0.01" value={f.amountReceived} onChange={(e) => set('amountReceived', e.target.value)} /></div>
          <div><label style={label}>Received via</label>
            <select style={input} value={f.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><label style={label}>Internal notes</label><input style={input} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>

        <div style={{ marginTop: 16 }}>
          <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Create booking'}</button>
          <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...box, maxWidth: wide ? 820 : 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer' }} aria-label="Close">&times;</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: 16, overflowY: 'auto' };
const box = { background: '#fff', borderRadius: 8, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', margin: '20px 0' };
const card = { background: '#fff', padding: 16, borderRadius: 6, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' };
const subCard = { background: '#faf7ef', padding: 14, borderRadius: 6, marginTop: 14, border: '1px solid #eee2bf' };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 };
const h4 = { margin: '18px 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' };
const label = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 };
const input = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' };
const btnPrimary = { background: '#c9a24b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginRight: 8 };
const btnSecondary = { background: '#eee', color: '#333', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginRight: 8 };
const btnDanger = { background: '#c0392b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13 };
const th = { padding: '10px 12px', fontSize: 13 };
const td = { padding: '10px 12px', fontSize: 13, verticalAlign: 'top' };