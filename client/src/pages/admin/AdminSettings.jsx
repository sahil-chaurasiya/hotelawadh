import { useEffect, useState } from 'react';
import api from '../../api/client';

// Matches PAGE_BANNER_KEYS in server/src/routes/setting.routes.js and the
// `image` prop each page passes to <PageBanner> when no admin image is set.
const PAGE_BANNERS = [
  { key: 'about', label: 'About Us', fallback: '/assets/images/banner/1.jpg' },
  { key: 'contact', label: 'Contact Us', fallback: '/assets/images/banner/4.jpg' },
  { key: 'gallery', label: 'Gallery', fallback: '/assets/images/banner/3.jpg' },
  { key: 'rooms', label: 'Rooms & Suites', fallback: '/assets/images/banner/2.jpg' },
  { key: 'roomDetail', label: 'Single Room Page', fallback: '/assets/images/banner/3.jpg' },
  { key: 'blog', label: 'Blog Listing', fallback: '/assets/images/banner/2.jpg' },
  { key: 'blogDetail', label: 'Single Blog Post', fallback: '/assets/images/banner/2.jpg' },
];

export default function AdminSettings() {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then(({ data }) => setForm(data.data))
      .catch((err) => setError(err.message));
  }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onNumberChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value === '' ? '' : Number(value) }));
  };

  const onSocialChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, socialLinks: { ...f.socialLinks, [name]: value } }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const { data } = await api.put('/settings', form);
      setForm(data.data);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadTestimonialsBg = async (file) => {
    setUploadingBg(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/settings/testimonials-bg-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingBg(false);
    }
  };

  const [uploadingBanner, setUploadingBanner] = useState('');

  const uploadPageBanner = async (pageKey, file) => {
    setUploadingBanner(pageKey);
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post(`/settings/page-banner/${pageKey}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingBanner('');
    }
  };

  if (!form) return <p>Loading&hellip;</p>;

  return (
    <div>
      <h1>Site Settings</h1>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {saved && <p style={{ color: '#2e7d32' }}>Saved.</p>}
      <form onSubmit={submit} style={card}>
        <div style={grid2}>
          <div>
            <label style={label}>Site name</label>
            <input name="siteName" value={form.siteName} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>Phone</label>
            <input name="phone" value={form.phone} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>Email</label>
            <input name="email" value={form.email} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>Address</label>
            <input name="address" value={form.address} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>Check-in time</label>
            <input name="checkInTime" value={form.checkInTime} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>Check-out time</label>
            <input name="checkOutTime" value={form.checkOutTime} onChange={onChange} style={input} />
          </div>
        </div>
        <h3 style={{ marginTop: 0 }}>Online booking &amp; payments</h3>
        <p style={{ color: '#666', fontSize: 13, marginTop: -6 }}>
          Controls the booking widget on each room page. Razorpay keys are set in the server&apos;s <code>.env</code> file
          (never here).
        </p>
        <div style={grid2}>
          <div>
            <label style={label}>Accept online bookings</label>
            <select
              value={form.onlineBookingEnabled === false ? 'no' : 'yes'}
              onChange={(e) => setForm((f) => ({ ...f, onlineBookingEnabled: e.target.value === 'yes' }))}
              style={input}
            >
              <option value="yes">Yes</option>
              <option value="no">No (customers are asked to call)</option>
            </select>
          </div>
          <div>
            <label style={label}>GST / tax % added to room tariff</label>
            <input name="taxPercent" type="number" min="0" max="100" step="0.01" value={form.taxPercent ?? 0} onChange={onNumberChange} style={input} />
          </div>
          <div>
            <label style={label}>% collected online at booking</label>
            <input name="advancePercent" type="number" min="1" max="100" value={form.advancePercent ?? 100} onChange={onNumberChange} style={input} />
          </div>
          <div>
            <label style={label}>Max rooms per online booking</label>
            <input name="maxRoomsPerBooking" type="number" min="1" value={form.maxRoomsPerBooking ?? 5} onChange={onNumberChange} style={input} />
          </div>
        </div>

        <h3 style={{ marginTop: 0 }}>Social links</h3>
        <p style={{ color: '#666', fontSize: 13, marginTop: -6 }}>
          All optional. Leave a field blank to hide that icon in the site footer — only the ones
          you fill in will appear.
        </p>
        <div style={grid2}>
          <div>
            <label style={label}>Facebook URL</label>
            <input
              name="facebook"
              value={form.socialLinks?.facebook || ''}
              onChange={onSocialChange}
              style={input}
              placeholder="https://facebook.com/yourpage"
            />
          </div>
          <div>
            <label style={label}>Twitter / RSS URL</label>
            <input
              name="twitter"
              value={form.socialLinks?.twitter || ''}
              onChange={onSocialChange}
              style={input}
              placeholder="https://twitter.com/yourhandle"
            />
          </div>
          <div>
            <label style={label}>LinkedIn URL</label>
            <input
              name="linkedin"
              value={form.socialLinks?.linkedin || ''}
              onChange={onSocialChange}
              style={input}
              placeholder="https://linkedin.com/company/yourcompany"
            />
          </div>
          <div>
            <label style={label}>Instagram URL</label>
            <input
              name="instagram"
              value={form.socialLinks?.instagram || ''}
              onChange={onSocialChange}
              style={input}
              placeholder="https://instagram.com/yourhandle"
            />
          </div>
        </div>

        <button type="submit" style={btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </form>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>&ldquo;Our Client Says&rdquo; background image</h3>
        <p style={{ color: '#666', fontSize: 13, marginTop: -6 }}>
          This is the full-width background behind the testimonials/reviews section on the homepage.
        </p>
        {form.testimonialsBgImage?.url && (
          <img
            src={form.testimonialsBgImage.url}
            alt="Testimonials background"
            style={{ width: '100%', maxWidth: 480, borderRadius: 4, display: 'block', marginBottom: 10 }}
          />
        )}
        <label style={{ ...btnSecondary, display: 'inline-block', cursor: 'pointer' }}>
          {uploadingBg ? 'Uploading...' : form.testimonialsBgImage?.url ? 'Replace image' : 'Upload image'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && uploadTestimonialsBg(e.target.files[0])}
          />
        </label>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Page Banner Images</h3>
        <p style={{ color: '#666', fontSize: 13, marginTop: -6 }}>
          The dark image behind the title and breadcrumb at the top of each page (e.g. the &ldquo;About
          Us&rdquo; banner). Each page keeps using its original built-in image until you upload a
          replacement here.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {PAGE_BANNERS.map(({ key, label, fallback }) => {
            const current = form.pageBanners?.[key]?.url || fallback;
            return (
              <div key={key} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12 }}>
                <img
                  src={current}
                  alt={label}
                  style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 4, marginBottom: 10 }}
                />
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{label}</div>
                <label style={{ ...btnSecondary, display: 'inline-block', cursor: 'pointer' }}>
                  {uploadingBanner === key ? 'Uploading...' : form.pageBanners?.[key]?.url ? 'Replace image' : 'Upload image'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files[0] && uploadPageBanner(key, e.target.files[0])}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const card = { background: '#fff', padding: 20, borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 16 };
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 };
const label = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 };
const input = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' };
const btnPrimary = { background: '#c9a24b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13 };
const btnSecondary = { background: '#eee', color: '#333', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13 };