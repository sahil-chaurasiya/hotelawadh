import { Routes, Route } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';

import PublicLayout from './layouts/PublicLayout';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Rooms from './pages/Rooms';
import RoomDetail from './pages/RoomDetail';
import News from './pages/News';
import NewsDetail from './pages/NewsDetail';
import Gallery from './pages/Gallery';
import NotFound from './pages/NotFound';

import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminHero from './pages/admin/AdminHero';
import AdminAboutImages from './pages/admin/AdminAboutImages';
import AdminAboutSection from './pages/admin/AdminAboutSection';
import AdminRooms from './pages/admin/AdminRooms';
import AdminRoomCategories from './pages/admin/AdminRoomCategories';
import AdminAmenities from './pages/admin/AdminAmenities';
import AdminBookings from './pages/admin/AdminBookings';
import AdminEnquiries from './pages/admin/AdminEnquiries';
import AdminBlog from './pages/admin/AdminBlog';
import AdminGallery from './pages/admin/AdminGallery';
import AdminGalleryCategories from './pages/admin/AdminGalleryCategories';
import AdminTestimonials from './pages/admin/AdminTestimonials';
import AdminSettings from './pages/admin/AdminSettings';
import AdminSpecialization from './pages/admin/AdminSpecialization';
import AdminServices from './pages/admin/AdminServices';
import AdminFacilities from './pages/admin/AdminFacilities';

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/rooms/:slug" element={<RoomDetail />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/:slug" element={<NewsDetail />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="hero" element={<AdminHero />} />
          <Route path="about-images" element={<AdminAboutImages />} />
          <Route path="about-section" element={<AdminAboutSection />} />
          <Route path="rooms" element={<AdminRooms />} />
          <Route path="room-categories" element={<AdminRoomCategories />} />
          <Route path="amenities" element={<AdminAmenities />} />
          <Route path="facilities" element={<AdminFacilities />} />
          <Route path="bookings" element={<AdminBookings />} />
          <Route path="enquiries" element={<AdminEnquiries />} />
          <Route path="blog" element={<AdminBlog />} />
          <Route path="gallery" element={<AdminGallery />} />
          <Route path="gallery-categories" element={<AdminGalleryCategories />} />
          <Route path="testimonials" element={<AdminTestimonials />} />
          <Route path="specialization" element={<AdminSpecialization />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}