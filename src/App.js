import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header/Header';
import FooterSimple from './components/Footer/FooterSimple';
import HeroSection from './components/HomeSections/Hero';
import AboutSection from './components/HomeSections/About';
import MissionSection from './components/HomeSections/Mission';
import VideoSection from './components/HomeSections/Video';
import MarqueeSection from './components/HomeSections/Marquee';
import CoursesSection from './components/HomeSections/Courses';
import { PortfolioPage, PortfolioItemPage } from './components/Pages/PortfolioPages';
import BlogMainPage from './components/Pages/BlogMainPage';
import BlogCategory from './components/Pages/BlogCategory';
import SingleBlogPostPage from './components/Pages/SingleBlogPostPage';
import SubscribeSection from './components/HomeSections/Subscribe';
import WhyGorythmSection from './components/HomeSections/WhyGorythm';
import BlogSection from './components/HomeSections/BlogSection';
import StudentTestimonialsSection from './components/HomeSections/StudentTestimonials';
import SocialSidebar from './components/SocialSidebar/SocialSidebar';
import SmoothScroll from './components/SmoothScroll/SmoothScroll';
import DashboardLayout from './components/Admin/DashboardLayout';
import DashboardHome from './components/Admin/DashboardHome';
import Cursor from './components/Cursor/Cursor';
import ScrollToTop from './components/ScrollToTop/ScrollToTop';
// Side icon: floating WhatsApp button fixed on the left of the viewport
// import WhatsAppFloat from './components/WhatsAppFloat/WhatsAppFloat';
import './styles/App.scss';

// Import new page components
import AllCourses from './components/Pages/AllCourses';
import { SingleCourse } from './components/Pages/SingleCourse';
import Login from './components/Pages/Login';
import AboutPage from './components/Pages/AboutPage';
import ContactPage from './components/Pages/ContactPage';
import {
  SatelliteMaintenancePage,
  ExplorationMissionsPage,
  ResearchObservationPage,
} from './components/Pages/MissionPages';

// Import Admin Login component
import AdminLogin from './components/Admin/pages/Login';

// Import Admin Management Components
import UsersManagement from './components/Admin/pages/UsersManagement';
import CoursesManagement from './components/Admin/pages/CoursesManagement';
import PaymentsManagement from './components/Admin/pages/PaymentsManagement';
import Analytics from './components/Admin/pages/Analytics';
import Settings from './components/Admin/pages/Settings';
import EnrollmentsManagement from './components/Admin/pages/EnrollmentsManagement';
import PaymentGateway from './components/Admin/pages/PaymentGateway';
import PeopleManagement from './components/Admin/pages/PeopleManagement';
import ContactMessages from './components/Admin/pages/ContactMessages';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import PortalLayout from './components/Portals/PortalLayout';
import StudentPortal from './components/Portals/StudentPortal';
import TeacherPortal from './components/Portals/TeacherPortal';
import ParentPortal from './components/Portals/ParentPortal';
import AccountantPortal from './components/Portals/AccountantPortal';
import { CurrencyProvider } from './context/CurrencyContext';


const Home = () => {
  return (
    <div className="front_page">
      {/* Hero Section - Full width, not constrained */}
      <HeroSection />
      
      {/* Other sections */}
      <AboutSection />
      <MissionSection />
      <VideoSection />
      <MarqueeSection />
      <CoursesSection />
      <SubscribeSection />
      <WhyGorythmSection />
      <StudentTestimonialsSection />
      <BlogSection />
    </div>
  );
};

function AppLayout() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <SmoothScroll>
      <div className={`academy-app ${isAdminRoute ? 'admin-route' : ''}`}>
        <Cursor />
         
          {/* Header is already correctly positioned here */}
          <Header toggleSidebar={toggleSidebar} />
          
          {/* Pass state and close function to Sidebar */}
          <SocialSidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
          {/* Side icon: floating WhatsApp button fixed on the left of the viewport */}
          {/* <WhatsAppFloat /> */}
	  
          <ScrollToTop />
          
          <main className="main-content">
            <Routes key={location.pathname}>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/courses" element={<AllCourses />} />
              <Route path="/courses/:slug" element={<SingleCourse />} />
              <Route path="/payment" element={<PaymentGateway />} />
              <Route path="/instructors" element={<div className="content-container"><h1>Instructors</h1><p>Page content.</p></div>} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/schedule" element={<ContactPage />} />

              {/* Mission detail pages */}
              <Route path="/mission/satellite-maintenance" element={<SatelliteMaintenancePage />} />
              <Route path="/mission/exploration-missions" element={<ExplorationMissionsPage />} />
              <Route path="/mission/research-and-observation" element={<ResearchObservationPage />} />

              {/* Portfolio pages */}
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/portfolio/:slug" element={<PortfolioItemPage />} />

              {/* Blog: main listing, category view, single post */}
              <Route path="/blog/category/:categorySlug" element={<BlogCategory />} />
              <Route path="/blog/:slug" element={<SingleBlogPostPage />} />
              <Route path="/blog" element={<BlogMainPage />} />
              
              {/* Admin Login Route */}
              <Route path="/admin/login" element={<AdminLogin />} />
              
              {/* Protected Admin Routes */}
              <Route element={<ProtectedRoute allowedRoles={['super-admin', 'admin']} />}>
                <Route path="/admin/*" element={<DashboardLayout />}>
                  <Route index element={<DashboardHome />} />
                  <Route path="dashboard" element={<DashboardHome />} />
                  <Route path="users" element={<UsersManagement key="staff-users-tab" variant="staff" />} />
                  <Route path="people" element={<PeopleManagement />} />
                  <Route path="courses" element={<CoursesManagement />} />
                  <Route path="assignments" element={<div>Assignments Management</div>} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="payments" element={<PaymentsManagement />} />
                  <Route path="enrollments" element={<EnrollmentsManagement />} />
                  <Route path="contact-messages" element={<ContactMessages />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['student']} />}>
                <Route path="/student/*" element={<PortalLayout role="student" title="Student Portal" />}>
                  <Route index element={<StudentPortal />} />
                  <Route path="courses" element={<StudentPortal />} />
                  <Route path="assignments" element={<StudentPortal />} />
                  <Route path="quizzes" element={<StudentPortal />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
                <Route path="/teacher/*" element={<PortalLayout role="teacher" title="Teacher Portal" />}>
                  <Route index element={<TeacherPortal />} />
                  <Route path="classes" element={<TeacherPortal />} />
                  <Route path="attendance" element={<TeacherPortal />} />
                  <Route path="content" element={<TeacherPortal />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['parent']} />}>
                <Route path="/parent/*" element={<PortalLayout role="parent" title="Parent Portal" />}>
                  <Route index element={<ParentPortal />} />
                  <Route path="children" element={<ParentPortal />} />
                  <Route path="progress" element={<ParentPortal />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['accountant']} />}>
                <Route path="/accountant/*" element={<PortalLayout role="accountant" title="Accountant Portal" />}>
                  <Route index element={<AccountantPortal />} />
                  <Route path="payments" element={<AccountantPortal />} />
                  <Route path="reports" element={<AccountantPortal />} />
                </Route>
              </Route>
              
              {/* Redirect to home */}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
          <FooterSimple />
        </div>
      </SmoothScroll>
  );
}

function App() {
  return (
    <CurrencyProvider>
      <Router>
        <Routes>
          <Route path="*" element={<AppLayout />} />
        </Routes>
      </Router>
    </CurrencyProvider>
  );
}

export default App;