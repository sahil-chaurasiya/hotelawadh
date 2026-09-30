import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const inr = (n) =>
  `\u20b9${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + n));
};
const nightsOf = (a, b) => {
  if (!a || !b) return 0;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
const prettyDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

// Same rule the server uses (server is still the authority): single rate or double rate per room.
function rates(room) {
  const single = room.price > 0 ? room.price : room.priceDouble || 0;
  const dbl = room.priceDouble > 0 ? room.priceDouble : single;
  return { single, double: dbl };
}
const nightRate = (room, type) => (type === 'single' ? rates(room).single : rates(room).double);

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.getElementById('razorpay-checkout-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => reject(new Error('Could not load the payment gateway')));
      return undefined;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Could not load the payment gateway. Check your internet connection.'));
    document.body.appendChild(script);
    return undefined;
  });
}

function Stepper({ value, min, max, onChange, label }) {
  return (
    <div className="rbw-stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>&minus;</button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

export default function RoomBookingWidget({ room, settings, initialCheckIn = '', initialCheckOut = '' }) {
  const startIn = initialCheckIn && initialCheckIn >= todayISO() ? initialCheckIn : todayISO();
  const startOut = initialCheckOut && initialCheckOut > startIn ? initialCheckOut : addDays(startIn, 1);

  const [step, setStep] = useState(1); // 1 stay, 2 guest, 3 review & pay, 4 confirmed
  const [checkIn, setCheckIn] = useState(startIn);
  const [checkOut, setCheckOut] = useState(startOut);
  const [occupancy, setOccupancy] = useState([{ type: 'single' }]);
  const [guest, setGuest] = useState({ firstName: '', lastName: '', email: '', phone: '', specialRequests: '' });
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingPayment, setPendingPayment] = useState(null);
  const [result, setResult] = useState(null);

  const nights = nightsOf(checkIn, checkOut);
  const maxRooms = Math.max(1, Math.min(settings?.maxRoomsPerBooking || 5, room.totalUnits || 1));
  const { single: singleRate, double: doubleRate } = rates(room);
  const priceSet = singleRate > 0 && doubleRate > 0;
  const hasChoice = singleRate !== doubleRate;
  const bookingOff = settings && settings.onlineBookingEnabled === false;

  const clearHold = () => setPendingPayment(null);

  const setRooms = (n) => {
    const count = Math.max(1, Math.min(maxRooms, n));
    setOccupancy((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push({ type: prev[prev.length - 1]?.type || 'single' });
      return next;
    });
    clearHold();
  };
  const setOcc = (i, patch) => {
    setOccupancy((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
    clearHold();
  };
  const onCheckIn = (v) => {
    if (!v) return;
    setCheckIn(v);
    if (!checkOut || checkOut <= v) setCheckOut(addDays(v, 1));
    clearHold();
  };
  const onCheckOut = (v) => {
    if (!v) return;
    setCheckOut(v);
    clearHold();
  };

  // Live, server-calculated quote whenever the stay changes
  const occKey = JSON.stringify(occupancy);
  useEffect(() => {
    if (!priceSet || nights < 1) {
      setQuote(null);
      return undefined;
    }
    let active = true;
    setQuoting(true);
    const t = setTimeout(() => {
      api
        .post('/bookings/quote', { roomId: room._id, checkIn, checkOut, occupancy })
        .then(({ data }) => active && setQuote(data.data))
        .catch((err) => active && setQuote({ available: false, message: err.message }))
        .finally(() => active && setQuoting(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room._id, checkIn, checkOut, occKey, nights, priceSet]);

  const guestErrors = useMemo(() => {
    const e = {};
    if (!guest.firstName.trim()) e.firstName = 'Required';
    if (!guest.lastName.trim()) e.lastName = 'Required';
    if (!/^\S+@\S+\.\S+$/.test(guest.email.trim())) e.email = 'Enter a valid email';
    if (guest.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a 10-digit mobile number';
    return e;
  }, [guest]);
  const [touched, setTouched] = useState(false);

  const verifyPayment = async (reference, response) => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/bookings/verify', { reference, ...response });
      setResult(data.data);
      setPendingPayment(null);
      setStep(4);
    } catch (err) {
      setError(`${err.message} If money was deducted, do not pay again \u2014 quote reference ${reference} to the hotel.`);
    } finally {
      setSubmitting(false);
    }
  };

  const openCheckout = async (pay) => {
    await loadRazorpay();
    const { booking, payment } = pay;
    const rzp = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amount,
      currency: payment.currency,
      order_id: payment.orderId,
      name: settings?.siteName || 'Hotel Awadh Palace',
      description: `${room.name} \u00b7 ${booking.roomCount} room${booking.roomCount > 1 ? 's' : ''} \u00b7 ${booking.nights} night${booking.nights > 1 ? 's' : ''}`,
      prefill: { name: `${guest.firstName} ${guest.lastName}`.trim(), email: guest.email, contact: guest.phone },
      notes: { reference: booking.reference },
      theme: { color: '#c9a24b' },
      handler: (response) => verifyPayment(booking.reference, response),
      modal: {
        ondismiss: () => setError(`Payment not completed. Your rooms are held for ${payment.holdMinutes} minutes \u2014 press Pay to try again.`),
      },
    });
    rzp.on('payment.failed', (resp) => setError(`Payment failed: ${resp?.error?.description || 'please try again'}`));
    rzp.open();
  };

  const pay = async () => {
    setSubmitting(true);
    setError('');
    try {
      let p = pendingPayment;
      if (!p) {
        const { data } = await api.post('/bookings', { roomId: room._id, checkIn, checkOut, occupancy, guest });
        p = data.data;
        setPendingPayment(p);
      }
      await openCheckout(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const q = quote?.available ? quote : null;
  const canContinue = priceSet && q && !quoting && q.paymentsConfigured && nights >= 1;

  // ---------------- render ----------------
  return (
    <div className="rbw">
      <style>{css}</style>

      <div className="rbw-head">
        <div className="rbw-from">{priceSet ? 'Starting from' : 'Rates'}</div>
        {priceSet ? (
          <div className="rbw-price">
            {inr(singleRate)}
            <small> / night</small>
          </div>
        ) : (
          <div className="rbw-price" style={{ fontSize: 18 }}>Please call for rates</div>
        )}
        {priceSet && hasChoice && (
          <div className="rbw-tariff">
            <span><b>Single</b>{inr(singleRate)}</span>
            <span><b>Double</b>{inr(doubleRate)}</span>
          </div>
        )}
        <div className="rbw-note">
          Breakfast included &middot; {settings?.taxPercent > 0 ? `+${settings.taxPercent}% GST` : 'Taxes as applicable'}
          {settings?.checkOutTime ? ` \u00b7 Check-out ${settings.checkOutTime}` : ''}
        </div>
      </div>

      {bookingOff && <div className="rbw-alert">Online booking is currently unavailable. Please call {settings?.phone || 'the hotel'} to book.</div>}
      {!priceSet && !bookingOff && <div className="rbw-alert">Online booking for this room isn&apos;t open yet. Please call {settings?.phone || 'the hotel'} to book.</div>}

      {priceSet && !bookingOff && step < 4 && (
        <ol className="rbw-steps">
          {['Stay', 'Guest', 'Pay'].map((s, i) => (
            <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
              <i>{step > i + 1 ? '\u2713' : i + 1}</i>{s}
            </li>
          ))}
        </ol>
      )}

      {priceSet && !bookingOff && step === 1 && (
        <div className="rbw-body">
          <div className="rbw-row2">
            <label className="rbw-field">
              <span>Check-in</span>
              <input type="date" min={todayISO()} value={checkIn} onChange={(e) => onCheckIn(e.target.value)} />
            </label>
            <label className="rbw-field">
              <span>Check-out</span>
              <input type="date" min={addDays(checkIn, 1)} value={checkOut} onChange={(e) => onCheckOut(e.target.value)} />
            </label>
          </div>
          {nights > 0 && (
            <div className="rbw-chip">
              {nights} night{nights > 1 ? 's' : ''} &middot; {prettyDate(checkIn)} &rarr; {prettyDate(checkOut)}
            </div>
          )}

          <div className="rbw-line">
            <div>
              <b>Rooms</b>
              <small>{room.totalUnits} {room.name} rooms in total</small>
            </div>
            <Stepper value={occupancy.length} min={1} max={maxRooms} onChange={setRooms} label="rooms" />
          </div>

          {occupancy.map((o, i) => (
            <div className="rbw-room" key={i}>
              <div className="rbw-room-h">
                <b>Room {i + 1}</b>
                <span>{inr(nightRate(room, o.type))}<small>/night</small></span>
              </div>
              {hasChoice && (
                <div className="rbw-seg" role="radiogroup" aria-label={`Occupancy for room ${i + 1}`}>
                  {[['single', 'Single', singleRate], ['double', 'Double', doubleRate]].map(([val, name, rate]) => (
                    <button
                      key={val}
                      type="button"
                      role="radio"
                      aria-checked={o.type === val}
                      className={o.type === val ? 'on' : ''}
                      onClick={() => setOcc(i, { type: val })}
                    >
                      {name}<small>{inr(rate)}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="rbw-summary">
            {quoting && <div className="rbw-muted">Checking availability&hellip;</div>}
            {!quoting && nights < 1 && <div className="rbw-muted">Choose your dates to see the price.</div>}
            {!quoting && quote && !quote.available && <div className="rbw-bad">{quote.message || 'Not available for these dates.'}</div>}
            {!quoting && q && (
              <>
                {q.availableUnits <= 3 && <div className="rbw-warn">Only {q.availableUnits} room{q.availableUnits > 1 ? 's' : ''} left for these dates!</div>}
                <Breakdown q={q} />
              </>
            )}
          </div>

          <button type="button" className="rbw-btn" disabled={!canContinue} onClick={() => setStep(2)}>
            Continue
          </button>
          {q && !q.paymentsConfigured && <div className="rbw-bad" style={{ marginTop: 8 }}>Online payment isn&apos;t available right now. Please call {settings?.phone || 'the hotel'}.</div>}
        </div>
      )}

      {priceSet && !bookingOff && step === 2 && (
        <form
          className="rbw-body"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (Object.keys(guestErrors).length === 0) setStep(3);
          }}
        >
          <div className="rbw-chip">
            {occupancy.length} room{occupancy.length > 1 ? 's' : ''} &middot; {nights} night{nights > 1 ? 's' : ''} &middot; {q ? inr(q.pricing.totalAmount) : ''}
          </div>
          <div className="rbw-row2">
            <label className="rbw-field">
              <span>First name</span>
              <input autoComplete="given-name" value={guest.firstName} onChange={(e) => setGuest({ ...guest, firstName: e.target.value })} />
              {touched && guestErrors.firstName && <em>{guestErrors.firstName}</em>}
            </label>
            <label className="rbw-field">
              <span>Last name</span>
              <input autoComplete="family-name" value={guest.lastName} onChange={(e) => setGuest({ ...guest, lastName: e.target.value })} />
              {touched && guestErrors.lastName && <em>{guestErrors.lastName}</em>}
            </label>
          </div>
          <label className="rbw-field">
            <span>Email</span>
            <input type="email" autoComplete="email" placeholder="you@example.com" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
            {touched && guestErrors.email && <em>{guestErrors.email}</em>}
          </label>
          <label className="rbw-field">
            <span>Mobile number</span>
            <input type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
            {touched && guestErrors.phone && <em>{guestErrors.phone}</em>}
          </label>
          <label className="rbw-field">
            <span>Special requests <small>(optional)</small></span>
            <textarea rows="2" value={guest.specialRequests} onChange={(e) => setGuest({ ...guest, specialRequests: e.target.value })} />
          </label>
          <div className="rbw-actions">
            <button type="button" className="rbw-btn ghost" onClick={() => setStep(1)}>Back</button>
            <button type="submit" className="rbw-btn">Review &amp; pay</button>
          </div>
        </form>
      )}

      {priceSet && !bookingOff && step === 3 && (
        <div className="rbw-body">
          {!q ? (
            <div className="rbw-bad">{quote?.message || 'These rooms are no longer available for your dates.'}</div>
          ) : (
            <>
              <div className="rbw-review">
                <b>{room.name}</b> &times; {occupancy.length}
                <div>{prettyDate(checkIn)} &rarr; {prettyDate(checkOut)}</div>
                <div>{nights} night{nights > 1 ? 's' : ''}</div>
                <hr />
                <div>{guest.firstName} {guest.lastName}</div>
                <div>{guest.email} &middot; {guest.phone}</div>
              </div>
              <Breakdown q={q} />
              <div className="rbw-paynow">
                <span>{q.advancePercent < 100 ? `Pay now (${q.advancePercent}%)` : 'Pay now'}</span>
                <b>{inr(q.payNow)}</b>
              </div>
              {q.advancePercent < 100 && <div className="rbw-muted">Remaining {inr(q.payLater)} is payable at the hotel.</div>}
            </>
          )}
          {error && <div className="rbw-bad" style={{ marginTop: 10 }}>{error}</div>}
          <div className="rbw-actions">
            <button type="button" className="rbw-btn ghost" onClick={() => { setError(''); clearHold(); setStep(2); }} disabled={submitting}>Back</button>
            <button type="button" className="rbw-btn" onClick={pay} disabled={submitting || !q}>
              {submitting ? 'Please wait\u2026' : `Pay ${q ? inr(q.payNow) : ''}`}
            </button>
          </div>
          <div className="rbw-muted" style={{ marginTop: 10, textAlign: 'center' }}>
            Secure payment by Razorpay &middot; UPI, cards, netbanking &amp; wallets
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="rbw-body rbw-done">
          <div className="rbw-tick">&#10003;</div>
          <h4>Booking confirmed!</h4>
          <div className="rbw-ref">{result.reference}</div>
          <div className="rbw-review">
            <div><b>{result.room?.name || room.name}</b> &times; {result.roomCount}</div>
            <div>
              {new Date(result.checkIn).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })} &rarr;{' '}
              {new Date(result.checkOut).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <hr />
            <div className="rbw-kv"><span>Total</span><b>{inr(result.totalAmount)}</b></div>
            <div className="rbw-kv"><span>Paid online</span><b>{inr(result.amountPaid)}</b></div>
            {result.totalAmount - result.amountPaid > 0.009 && (
              <div className="rbw-kv"><span>Balance at hotel</span><b>{inr(result.totalAmount - result.amountPaid)}</b></div>
            )}
          </div>
          <div className="rbw-muted">Please keep this reference handy for check-in.</div>
        </div>
      )}
    </div>
  );
}

function Breakdown({ q }) {
  const p = q.pricing;
  return (
    <div className="rbw-break">
      {p.lines.map((l) => (
        <div className="rbw-kv" key={l.room}>
          <span>
            Room {l.room} &middot; {l.label}
            <small>{inr(l.perNight)} &times; {p.nights} night{p.nights > 1 ? 's' : ''}</small>
          </span>
          <b>{inr(l.stayTotal)}</b>
        </div>
      ))}
      <div className="rbw-kv sub"><span>Room tariff</span><b>{inr(p.subtotal)}</b></div>
      {p.taxAmount > 0 && <div className="rbw-kv sub"><span>GST ({p.taxPercent}%)</span><b>{inr(p.taxAmount)}</b></div>}
      <div className="rbw-kv total"><span>Total</span><b>{inr(p.totalAmount)}</b></div>
    </div>
  );
}

const css = `
.rbw{--g:#c9a24b;--gd:#a8832f;font-family:inherit;background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.10);overflow:hidden;color:#2b2b2b;text-align:left}
.rbw *{box-sizing:border-box}
.rbw-head{background:linear-gradient(135deg,#2b2417,#4a3a1c);color:#fff;padding:20px 22px}
.rbw-from{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;opacity:.7}
.rbw-price{font-size:32px;font-weight:700;line-height:1.15;color:#f0d58a}
.rbw-price small{font-size:14px;font-weight:400;color:#fff;opacity:.8}
.rbw-tariff{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0 10px}
.rbw-tariff span{background:rgba(255,255,255,.1);border-radius:8px;padding:7px 6px;text-align:center;font-size:13px;font-weight:600}
.rbw-tariff b{display:block;font-size:10px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;opacity:.7;margin-bottom:2px}
.rbw-note{font-size:12px;opacity:.75}
.rbw-alert{margin:16px;padding:12px 14px;background:#fff6e0;border:1px solid #f0d58a;border-radius:8px;font-size:14px}
.rbw-steps{list-style:none;display:flex;margin:0;padding:14px 18px 0;gap:6px}
.rbw-steps li{flex:1;display:flex;align-items:center;gap:6px;font-size:12px;color:#999;font-weight:600}
.rbw-steps i{width:22px;height:22px;border-radius:50%;background:#eee;color:#888;font-style:normal;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
.rbw-steps li.on{color:#2b2b2b}.rbw-steps li.on i{background:var(--g);color:#fff}
.rbw-steps li.done i{background:#2e7d32;color:#fff}
.rbw-body{padding:16px 18px 20px}
.rbw-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rbw-field{display:block;margin:0 0 12px}
.rbw-field>span{display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:#555}
.rbw-field small{font-weight:400;color:#999}
.rbw-field input,.rbw-field textarea{width:100%;padding:11px 12px;border:1.5px solid #e2e2e2;border-radius:9px;font-size:15px;background:#fafafa;transition:border .15s,background .15s;font-family:inherit}
.rbw-field input:focus,.rbw-field textarea:focus{outline:none;border-color:var(--g);background:#fff}
.rbw-field em{display:block;color:#c0392b;font-size:12px;font-style:normal;margin-top:4px}
.rbw-chip{background:#f7f1e1;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;margin:0 0 14px;color:#6b5420}
.rbw-line{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0}
.rbw-line.tight{padding:6px 0}
.rbw-line b{display:block;font-size:14px}
.rbw-line small{display:block;font-size:12px;color:#999;margin-top:1px}
.rbw-stepper{display:inline-flex;align-items:center;border:1.5px solid #e2e2e2;border-radius:24px;overflow:hidden;background:#fff}
.rbw-stepper button{width:36px;height:36px;border:0;background:#fff;font-size:20px;line-height:1;cursor:pointer;color:var(--gd)}
.rbw-stepper button:hover:not(:disabled){background:#f7f1e1}
.rbw-stepper button:disabled{color:#ccc;cursor:not-allowed}
.rbw-stepper span{min-width:30px;text-align:center;font-weight:700;font-size:15px}
.rbw-room{border:1.5px solid #eee;border-radius:12px;padding:10px 14px;margin:8px 0;background:#fcfbf8}
.rbw-seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.rbw-seg button{border:1.5px solid #e2e2e2;background:#fff;border-radius:10px;padding:9px 6px;font-size:14px;font-weight:600;cursor:pointer;color:#444;line-height:1.25}
.rbw-seg button small{display:block;font-size:12px;font-weight:500;color:#888}
.rbw-seg button.on{border-color:var(--g);background:#f7f1e1;color:#6b5420}
.rbw-seg button.on small{color:#6b5420}
.rbw-room-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;border-bottom:1px dashed #e6dcc0;padding-bottom:0;margin-bottom:0;flex-wrap:wrap}
.rbw-room-h span{font-size:12px;color:#6b5420;font-weight:600}
.rbw-room-h small{font-weight:400;color:#999}
.rbw-summary{margin:14px 0}
.rbw-muted{font-size:13px;color:#888}
.rbw-bad{font-size:13px;color:#b3261e;background:#fdecea;border-radius:8px;padding:10px 12px}
.rbw-warn{font-size:13px;color:#8a5a00;background:#fff3cd;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-weight:600}
.rbw-break{border:1.5px solid #eee;border-radius:12px;padding:6px 14px;background:#fff}
.rbw-kv{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:14px;align-items:flex-start}
.rbw-kv small{display:block;font-size:12px;color:#999}
.rbw-kv.sub{border-top:1px solid #f0f0f0;color:#555}
.rbw-kv.total{border-top:2px solid #2b2b2b;font-size:17px;font-weight:700}
.rbw-paynow{display:flex;justify-content:space-between;align-items:center;margin:12px 0 4px;padding:12px 14px;background:#f7f1e1;border-radius:10px;font-size:15px}
.rbw-paynow b{font-size:20px;color:#6b5420}
.rbw-review{font-size:14px;line-height:1.55;background:#faf9f6;border-radius:10px;padding:12px 14px;margin-bottom:12px}
.rbw-review hr{border:0;border-top:1px dashed #ddd;margin:8px 0}
.rbw-btn{width:100%;padding:14px;border:0;border-radius:10px;background:linear-gradient(135deg,#d8b45c,#b8892e);color:#fff;font-size:15px;font-weight:700;letter-spacing:.5px;cursor:pointer;transition:transform .1s,box-shadow .15s,opacity .15s;box-shadow:0 4px 14px rgba(184,137,46,.35)}
.rbw-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 18px rgba(184,137,46,.45)}
.rbw-btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.rbw-btn.ghost{background:#f1f1f1;color:#444;box-shadow:none;width:38%}
.rbw-actions{display:flex;gap:10px;margin-top:14px}
.rbw-actions .rbw-btn:not(.ghost){flex:1}
.rbw-done{text-align:center}
.rbw-tick{width:56px;height:56px;margin:4px auto 8px;border-radius:50%;background:#2e7d32;color:#fff;font-size:30px;display:flex;align-items:center;justify-content:center}
.rbw-done h4{margin:0 0 4px;color:#2e7d32}
.rbw-ref{display:inline-block;background:#f7f1e1;color:#6b5420;font-weight:700;letter-spacing:1px;padding:6px 14px;border-radius:8px;margin:6px 0 14px}
.rbw-done .rbw-review{text-align:left}
@media (max-width:420px){.rbw-row2{grid-template-columns:1fr}}
`;