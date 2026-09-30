import { useEffect, useRef, useState } from 'react';
import api from '../../api/client';

const emptyForm = {
  name: '',
  slug: '',
  category: '',
  description: '',
  shortDescription: '',
  price: '',
  priceDouble: '',
  extraPersonPrice: 600,
  capacityAdults: 2,
  capacityChildren: 0,
  sizeSqft: '',
  sizeSqmt: '',
  bedType: '',
  bathroomCount: 1,
  view: '',
  totalUnits: 1,
  featured: false,
  status: 'active',
  amenities: [],
};

const inrFmt = (n) => `\u20b9${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// What a guest pays per night in ONE room, using the same rule as the website.
function previewRate(t, type) {
  const single = Number(t.price) > 0 ? Number(t.price) : Number(t.priceDouble) || 0;
  const dbl = Number(t.priceDouble) > 0 ? Number(t.priceDouble) : single;
  return type === 'single' ? single : dbl;
}

// Quick tariff & inventory editor: one row per room type. Saves only pricing/inventory fields.
function TariffTable({ rooms, onSaved }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState({});

  useEffect(() => {
    const d = {};
    rooms.forEach((r) => {
      d[r._id] = {
        price: r.price ?? '',
        priceDouble: r.priceDouble || '',
        totalUnits: r.totalUnits ?? 1,
      };
    });
    setDrafts(d);
  }, [rooms]);

  const set = (id, k, v) => setDrafts((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));

  const save = async (room) => {
    const t = drafts[room._id];
    if (!(Number(t.price) > 0) && !(Number(t.priceDouble) > 0)) {
      setMsg((m) => ({ ...m, [room._id]: { bad: true, text: 'Enter at least the single price (must be more than 0).' } }));
      return;
    }
    setSavingId(room._id);
    try {
      await api.put(`/rooms/${room._id}`, {
        price: Number(t.price) || Number(t.priceDouble),
        priceDouble: Number(t.priceDouble) || 0,
        totalUnits: Math.max(1, parseInt(t.totalUnits, 10) || 1),
      });
      setMsg((m) => ({ ...m, [room._id]: { bad: false, text: 'Saved' } }));
      await onSaved();
    } catch (err) {
      setMsg((m) => ({ ...m, [room._id]: { bad: true, text: err.message } }));
    } finally {
      setSavingId(null);
    }
  };

  const cell = { padding: '8px 6px', verticalAlign: 'top' };
  const inp = { width: '100%', padding: '7px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' };

  return (
    <div style={{ background: '#fff', padding: 16, borderRadius: 6, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <h3 style={{ marginTop: 0 }}>Tariff &amp; room count</h3>
      <p style={{ color: '#666', fontSize: 13, marginTop: -4 }}>
        Set the per-night price for each room type, in rupees. Guests choose <strong>Single</strong> or <strong>Double</strong>{' '}
        occupancy for each room they book. If a room has only one price (like the Suite), fill Double and leave Single empty,
        or enter the same amount in both &mdash; guests then won&apos;t see a choice. Taxes are set in Settings.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 12, color: '#666', borderBottom: '1px solid #eee' }}>
              <th style={cell}>Room type</th>
              <th style={cell}>Single (&#8377;)</th>
              <th style={cell}>Double (&#8377;)</th>
              <th style={cell}>Rooms available</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => {
              const t = drafts[r._id];
              if (!t) return null;
              const ready = previewRate(t, 1) > 0;
              return (
                <tr key={r._id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={cell}>
                    <strong>{r.name}</strong>
                    <div style={{ fontSize: 11, color: r.status === 'active' ? '#2e7d32' : '#c0392b' }}>{r.status}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 4, lineHeight: 1.5 }}>
                      {ready ? (
                        <>
                          <div>Single: <b>{inrFmt(previewRate(t, 'single'))}</b></div>
                          <div>Double: <b>{inrFmt(previewRate(t, 'double'))}</b></div>
                        </>
                      ) : (
                        <span style={{ color: '#c0392b' }}>Price not set &mdash; not bookable online</span>
                      )}
                    </div>
                  </td>
                  <td style={cell}><input style={inp} type="number" min="0" step="1" value={t.price} onChange={(e) => set(r._id, 'price', e.target.value)} /></td>
                  <td style={cell}><input style={inp} type="number" min="0" step="1" value={t.priceDouble} onChange={(e) => set(r._id, 'priceDouble', e.target.value)} /></td>
                  <td style={cell}><input style={inp} type="number" min="1" step="1" value={t.totalUnits} onChange={(e) => set(r._id, 'totalUnits', e.target.value)} /></td>
                  <td style={cell}>
                    <button type="button" onClick={() => save(r)} disabled={savingId === r._id} style={{ background: '#c9a24b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
                      {savingId === r._id ? 'Saving...' : 'Save'}
                    </button>
                    {msg[r._id] && <div style={{ fontSize: 11, marginTop: 4, color: msg[r._id].bad ? '#c0392b' : '#2e7d32' }}>{msg[r._id].text}</div>}
                  </td>
                </tr>
              );
            })}
            {rooms.length === 0 && <tr><td style={cell} colSpan={5}>No rooms yet. Add one below.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const topRef = useRef(null);

  // Errors / the edit form live at the top of the page; bring them into view so actions never look "dead".
  const scrollToTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useEffect(() => {
    if (error) scrollToTop();
  }, [error]);

  const load = async () => {
    const [roomsRes, catRes, amenityRes] = await Promise.all([
      api.get('/rooms/admin/all'),
      api.get('/categories'),
      api.get('/amenities'),
    ]);
    setRooms(
      [...roomsRes.data.data].sort(
        (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
      )
    );
    setCategories(catRes.data.data);
    setAmenities(amenityRes.data.data);
  };

  useEffect(() => {
    load();
  }, []);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const toggleAmenity = (id) => {
    setForm((f) => {
      const has = f.amenities.includes(id);
      return { ...f, amenities: has ? f.amenities.filter((a) => a !== id) : [...f.amenities, id] };
    });
  };

  const startEdit = (room) => {
    setError('');
    setEditingId(room._id);
    setTimeout(scrollToTop, 0);
    setForm({
      name: room.name,
      slug: room.slug,
      category: room.category?._id || room.category,
      description: room.description,
      shortDescription: room.shortDescription || '',
      price: room.price,
      priceDouble: room.priceDouble || '',
      extraPersonPrice: room.extraPersonPrice ?? 600,
      capacityAdults: room.capacityAdults,
      capacityChildren: room.capacityChildren,
      sizeSqft: room.sizeSqft || '',
      sizeSqmt: room.sizeSqmt || '',
      bedType: room.bedType || '',
      bathroomCount: room.bathroomCount ?? 1,
      view: room.view || '',
      totalUnits: room.totalUnits,
      featured: room.featured,
      status: room.status,
      amenities: (room.amenities || []).map((a) => (a._id ? a._id : a)),
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        priceDouble: form.priceDouble !== '' ? Number(form.priceDouble) : 0,
        capacityAdults: Number(form.capacityAdults),
        capacityChildren: Number(form.capacityChildren),
        sizeSqft: form.sizeSqft ? Number(form.sizeSqft) : undefined,
        sizeSqmt: form.sizeSqmt ? Number(form.sizeSqmt) : undefined,
        bathroomCount: form.bathroomCount !== '' ? Number(form.bathroomCount) : undefined,
        totalUnits: Number(form.totalUnits),
        amenities: form.amenities,
      };
      if (editingId) {
        await api.put(`/rooms/${editingId}`, payload);
      } else {
        await api.post('/rooms', payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this room? This cannot be undone.')) return;
    try {
      await api.delete(`/rooms/${id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const moveRoom = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rooms.length) return;
    const reordered = [...rooms];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setRooms(reordered); // optimistic update so the list re-orders instantly
    try {
      await api.put('/rooms/reorder', { order: reordered.map((r) => r._id) });
    } catch (err) {
      setError(err.message);
      await load(); // revert to server order on failure
    }
  };

  const uploadImage = async (roomId, file) => {
    setUploadingId(roomId);
    try {
      const fd = new FormData();
      fd.append('image', file);
      await api.post(`/rooms/${roomId}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const deleteImage = async (roomId, publicId) => {
    if (!window.confirm('Remove this image?')) return;
    setError('');
    try {
      await api.delete(`/rooms/${roomId}/images/${encodeURIComponent(publicId)}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div ref={topRef}>
      <h1>Rooms</h1>
      <p style={{ color: '#666', fontSize: 13, marginTop: -6 }}>
        Manage room types, pricing, images, and details here. Need a new category (Deluxe, Executive, Suite&hellip;)
        or a new feature tag (Wi-Fi, Study Room, Smoking Room&hellip;)? Head to the <strong>Room Categories</strong> or{' '}
        <strong>Room Features</strong> pages in the sidebar first, then come back to assign them.
      </p>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      <TariffTable rooms={rooms} onSaved={load} />

      <form onSubmit={submit} style={card}>
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit room' : 'Add a room'}</h3>
        <div style={grid2}>
          <div>
            <label style={label}>Name</label>
            <input name="name" value={form.name} onChange={onChange} required style={input} />
          </div>
          <div>
            <label style={label}>Slug</label>
            <input name="slug" value={form.slug} onChange={onChange} required style={input} />
          </div>
          <div>
            <label style={label}>Category</label>
            <select name="category" value={form.category} onChange={onChange} required style={input}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Single occupancy price / night (&#8377;)</label>
            <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={onChange} required style={input} />
          </div>
          <div>
            <label style={label}>Double occupancy price / night (&#8377;)</label>
            <input name="priceDouble" type="number" min="0" step="0.01" value={form.priceDouble} onChange={onChange} placeholder="Leave empty = same as single" style={input} />
          </div>
          <div>
            <label style={label}>Size (sqft)</label>
            <input name="sizeSqft" type="number" min="0" value={form.sizeSqft} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>Size (sq.mt)</label>
            <input name="sizeSqmt" type="number" min="0" value={form.sizeSqmt} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>Bed type</label>
            <input name="bedType" value={form.bedType} onChange={onChange} placeholder="e.g. 1 King Bed" style={input} />
          </div>
          <div>
            <label style={label}>Bathrooms</label>
            <input name="bathroomCount" type="number" min="0" value={form.bathroomCount} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>View</label>
            <input name="view" value={form.view} onChange={onChange} placeholder="e.g. City View, Garden View" style={input} />
          </div>
          <div>
            <label style={label}>Total rooms of this type (bookable inventory)</label>
            <input name="totalUnits" type="number" min="1" value={form.totalUnits} onChange={onChange} style={input} />
          </div>
          <div>
            <label style={label}>Status</label>
            <select name="status" value={form.status} onChange={onChange} style={input}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>
        <div style={{ margin: '10px 0' }}>
          <label style={label}>Short description</label>
          <input name="shortDescription" value={form.shortDescription} onChange={onChange} style={input} />
        </div>
        <div style={{ margin: '10px 0' }}>
          <label style={label}>Description</label>
          <textarea name="description" rows="3" value={form.description} onChange={onChange} required style={input} />
        </div>
        <div style={{ margin: '10px 0' }}>
          <label style={label}>Features / Amenities</label>
          {amenities.length === 0 ? (
            <p style={{ fontSize: 13, color: '#777' }}>
              No features yet &mdash; add some on the <em>Room Features</em> page first.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
              {amenities.map((a) => (
                <label key={a._id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.amenities.includes(a._id)}
                    onChange={() => toggleAmenity(a._id)}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <label style={{ ...label, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" name="featured" checked={form.featured} onChange={onChange} /> Featured
        </label>
        <div style={{ marginTop: 14 }}>
          <button type="submit" style={btnPrimary} disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Update room' : 'Create room'}
          </button>
          {editingId && (
            <button type="button" style={btnSecondary} onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div style={{ marginTop: 30 }}>
        <p style={{ color: '#666', fontSize: 13 }}>
          Use the &uarr;/&darr; buttons to control the order rooms appear in on the Home page and the Rooms &amp;
          Suites page &mdash; top of this list shows first.
        </p>
        {rooms.map((room, index) => (
          <div key={room._id} style={{ ...card, display: 'flex', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => moveRoom(index, -1)}
                disabled={index === 0}
                style={{ ...btnSecondary, marginRight: 0, padding: '6px 10px', opacity: index === 0 ? 0.4 : 1 }}
                title="Move up"
              >
                &uarr;
              </button>
              <button
                type="button"
                onClick={() => moveRoom(index, 1)}
                disabled={index === rooms.length - 1}
                style={{ ...btnSecondary, marginRight: 0, padding: '6px 10px', opacity: index === rooms.length - 1 ? 0.4 : 1 }}
                title="Move down"
              >
                &darr;
              </button>
            </div>
            <div style={{ width: 160 }}>
              {room.images?.[0]?.url && (
                <img src={room.images[0].url} alt={room.name} style={{ width: '100%', borderRadius: 4 }} />
              )}
              <label style={{ ...btnSecondary, display: 'inline-block', marginTop: 8, cursor: 'pointer', textAlign: 'center' }}>
                {uploadingId === room._id ? 'Uploading...' : 'Add image'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files[0] && uploadImage(room._id, e.target.files[0])}
                />
              </label>
              {room.images?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {room.images.map((img, i) => (
                    <div key={img.publicId} style={{ textAlign: 'center' }}>
                      <img src={img.url} alt="" style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
                      <button
                        type="button"
                        onClick={() => deleteImage(room._id, img.publicId)}
                        style={{ fontSize: 11, border: '1px solid #ddd', background: '#fff', borderRadius: 4, cursor: 'pointer', marginTop: 2 }}
                        title={`Remove image ${i + 1}`}
                      >
                        remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 4px' }}>{room.name}</h3>
              <p style={{ margin: '0 0 8px', color: '#777', fontSize: 13 }}>
                {room.category?.name} &middot; &#8377;{room.price.toFixed(2)}/night{room.priceDouble > 0 ? ` (single) / \u20b9${room.priceDouble.toFixed(2)} (double)` : ''} &middot; {room.totalUnits} rooms &middot; {room.status}
                {room.featured ? ' \u2605 featured' : ''}
              </p>
              <p style={{ margin: '0 0 8px', color: '#777', fontSize: 13 }}>
                {room.sizeSqft ? `${room.sizeSqft} sqft` : ''}
                {room.sizeSqmt ? ` (${room.sizeSqmt} sq.mt)` : ''}
                {room.bedType ? ` \u00b7 ${room.bedType}` : ''}
                {room.bathroomCount ? ` \u00b7 ${room.bathroomCount} Bathroom${room.bathroomCount > 1 ? 's' : ''}` : ''}
                {room.view ? ` \u00b7 ${room.view}` : ''}
              </p>
              {room.amenities?.length > 0 && (
                <p style={{ margin: '0 0 8px', color: '#555', fontSize: 12 }}>
                  {room.amenities.map((a) => a.name).join(' \u00b7 ')}
                </p>
              )}
              <p style={{ fontSize: 13 }}>{room.shortDescription || room.description}</p>
              <button type="button" style={btnSecondary} onClick={() => startEdit(room)}>Edit</button>
              <button type="button" style={btnDanger} onClick={() => remove(room._id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const card = { background: '#fff', padding: 20, borderRadius: 6, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' };
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const label = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 };
const input = { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' };
const btnPrimary = { background: '#c9a24b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginRight: 8 };
const btnSecondary = { background: '#eee', color: '#333', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginRight: 8 };
const btnDanger = { background: '#c0392b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13 };