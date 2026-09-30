import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function toISODate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BookingSearchForm() {
  const navigate = useNavigate();
  const pickerRef = useRef(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');

  // Initialize the original t-datepicker plugin exactly as custom.js did,
  // and read its selection through the onChangeCI/onChangeCO custom events.
  useEffect(() => {
    const $ = window.jQuery;
    if (!$ || !pickerRef.current) return undefined;
    const $picker = $(pickerRef.current);
    $picker.tDatePicker({});
    const onCI = (e, utc) => setCheckIn(toISODate(utc));
    const onCO = (e, utc) => setCheckOut(toISODate(utc));
    $picker.on('onChangeCI', onCI);
    $picker.on('onChangeCO', onCO);
    return () => {
      $picker.off('onChangeCI', onCI);
      $picker.off('onChangeCO', onCO);
    };
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    navigate(`/rooms?${params.toString()}`);
  };

  return (
    <div className="section-full p-t25 booking-bar">
      <div className="container">
        <div className="booking-bar-inner site-bg-primary">
          <div className="booking-fram-name">
            <h3 className="m-a0">Book A Room</h3>
          </div>
          <div className="booking-form">
            <form onSubmit={submit}>
              <ul>
                <li className="date-cal-block">
                  <div className="form-group clearfix">
                    <label>In-Out Time</label>
                    <div className="t-datepicker" ref={pickerRef}>
                      <div className="t-check-in form-control" />
                      <div className="t-check-out form-control" />
                    </div>
                  </div>
                </li>

                <li className="booking-form-btn-block">
                  <div className="form-group">
                    <button type="submit" className="site-button-secondry btn-half">
                      <span>Book</span><em />
                    </button>
                  </div>
                </li>
              </ul>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}