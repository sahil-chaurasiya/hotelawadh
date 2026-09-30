import { Link } from 'react-router-dom';

export default function RoomCard({ room }) {
  const image = room.images?.[0]?.url || '/assets/images/rooms/pic1.jpg';
  return (
    <div className="item">
      <div className="room-rent-section-outer">
        <div className="room-rent-section">
          <div className="rooms-pic-section">
            <div className="wt-media">
              <img src={image} alt={room.name} />
              <div className="overlay-bx-3" />
              <h3 className="m-b0 wt-title">{room.name}</h3>
            </div>
          </div>
          <div className="room-info-section text-black">
            <span>₹{room.price.toFixed(2)}/night</span>
            <ul className="clearfix">
              {room.sizeSqft && (
                <li>
                  <i className="fa fa-expand" /> <strong>Size:</strong> {room.sizeSqft} sqft
                </li>
              )}
              {room.bedType && (
                <li>
                  <i className="fa fa-bed" /> <strong>Bed:</strong> {room.bedType}
                </li>
              )}
              {room.view && (
                <li>
                  <i className="fa fa-binoculars" /> <strong>View:</strong> {room.view}
                </li>
              )}
            </ul>
          </div>
        </div>
        <Link to={`/rooms/${room.slug}`} className="btn-half site-button button-lg">
          <span>More</span><em />
        </Link>
      </div>
    </div>
  );
}