import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import PageBanner from '../components/PageBanner';
import RoomBookingWidget from '../components/RoomBookingWidget';
import api from '../api/client';

export default function RoomDetail() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Admin > Settings > Page Banner Images ("Single Room Page").
  const [pageBanner, setPageBanner] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get('/settings')
      .then(({ data }) => {
        if (!active) return;
        setPageBanner(data.data?.pageBanners?.roomDetail);
        setSettings(data.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    api
      .get(`/rooms/${slug}`)
      .then(({ data }) => active && setRoom(data.data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) return <div className="container p-tb80 text-center">Loading room&hellip;</div>;
  if (error || !room) {
    return <div className="container p-tb80 text-center text-danger">{error || 'Room not found.'}</div>;
  }

  return (
    <>
      <PageBanner title={room.name} crumbs={[{ label: 'Rooms', to: '/rooms' }, { label: room.name }]} image={pageBanner?.url || '/assets/images/banner/3.jpg'} />

      <div className="section-full p-tb80">
        <div className="container">
          <div className="row">
            <div className="col-lg-8">
              <div className="wt-media m-b30">
                <img
                  src={room.images?.[0]?.url || '/assets/images/rooms/pic1.jpg'}
                  alt={room.name}
                  style={{ width: '100%', borderRadius: 4 }}
                />
              </div>
              {room.images?.length > 1 && (
                <div className="row m-b30">
                  {room.images.slice(1).map((img) => (
                    <div className="col-4" key={img.publicId}>
                      <img src={img.url} alt={room.name} style={{ width: '100%', borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              )}

              <h2 className="m-b15">{room.name}</h2>
              <p>{room.description}</p>

              <div className="row m-b30">
                {room.sizeSqft && (
                  <div className="col-md-4">
                    <strong>Size:</strong> {room.sizeSqft} sq.ft{room.sizeSqmt ? ` (${room.sizeSqmt} sq.mt)` : ''}
                  </div>
                )}
                {room.bedType && (
                  <div className="col-md-4">
                    <strong>Bed:</strong> {room.bedType}
                  </div>
                )}
                {!!room.bathroomCount && (
                  <div className="col-md-4">
                    <strong>Bathroom{room.bathroomCount > 1 ? 's' : ''}:</strong> {room.bathroomCount}
                  </div>
                )}
                {room.view && (
                  <div className="col-md-4">
                    <strong>View:</strong> {room.view}
                  </div>
                )}
              </div>

              {room.amenities?.length > 0 && (
                <>
                  <h3 className="m-b15">Amenities</h3>
                  <div className="row m-b30">
                    {room.amenities.map((a) => (
                      <div className="col-md-4 m-b15" key={a._id}>
                        <i className={`${a.icon} m-r10`} /> {a.name}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="col-lg-4">
              <RoomBookingWidget
                key={room._id}
                room={room}
                settings={settings}
                initialCheckIn={searchParams.get('checkIn') || ''}
                initialCheckOut={searchParams.get('checkOut') || ''}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}