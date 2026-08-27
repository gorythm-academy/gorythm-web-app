import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header/Header';
import FooterSimple from './components/Footer/FooterSimple';
import HeroSection from './components/HomeSections/Hero';
import SubscribePopup from './components/HomeSections/SubscribePopup';
import AboutSection from './components/HomeSections/About';
import MissionSection from './components/HomeSections/Mission';
import VideoSection from './components/HomeSections/Video';
// import MarqueeSection from './components/HomeSections/Marquee';
import CoursesSection from './components/HomeSections/Courses';
import SubscribeSection from './components/HomeSections/Subscribe';
import WhyGorythmSection from './components/HomeSections/WhyGorythm';
import ResearchSection from './components/HomeSections/ResearchSection';
import StudentTestimonialsSection from './components/HomeSections/StudentTestimonials';
import SmoothScroll from './components/SmoothScroll/SmoothScroll';
import Cursor from './components/Cursor/Cursor';
import ScrollToTop from './components/ScrollToTop/ScrollToTop';
// Side icon: floating WhatsApp button fixed on the left of the viewport
// import WhatsAppFloat from './components/WhatsAppFloat/WhatsAppFloat';
import './styles/App.scss';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import { AUTH_REALM } from './utils/authStorage';
import { CurrencyProvider } from './context/CurrencyContext';
import { usePageCanonical } from './hooks/usePageCanonical';
import { RoutePageMeta } from './hooks/usePageMeta';

const AllCourses = lazy(() => import('./components/Pages/AllCourses'));
const SingleCourse = lazy(() =>
  import('./components/Pages/SingleCourse').then((m) => ({ default: m.SingleCourse }))
);
const Login = lazy(() => import('./components/Pages/Login'));
const AboutPage = lazy(() => import('./components/Pages/AboutPage'));
const ContactPage = lazy(() => import('./components/Pages/ContactPage'));
const IqMissionPage = lazy(() =>
  import('./components/Pages/MissionPages').then((m) => ({ default: m.IqMissionPage }))
);
const EqMissionPage = lazy(() =>
  import('./components/Pages/MissionPages').then((m) => ({ default: m.EqMissionPage }))
);
const PhqMissionPage = lazy(() =>
  import('./components/Pages/MissionPages').then((m) => ({ default: m.PhqMissionPage }))
);
const AdminLogin = lazy(() => import('./components/Admin/pages/Login'));
const UsersManagement = lazy(() => import('./components/Admin/pages/UsersManagement'));
const CoursesManagement = lazy(() => import('./components/Admin/pages/CoursesManagement'));
const PaymentsManagement = lazy(() => import('./components/Admin/pages/PaymentsManagement'));
const Analytics = lazy(() => import('./components/Admin/pages/Analytics'));
const StudentsData = lazy(() => import('./components/Admin/pages/StudentsData'));
const PaymentGateway = lazy(() => import('./components/Admin/pages/PaymentGateway'));
const PaymentSuccess = lazy(() =>
  import('./components/Pages/PaymentSuccess').then((m) => ({ default: m.PaymentSuccess }))
);
const PaymentCancel = lazy(() =>
  import('./components/Pages/PaymentCancel').then((m) => ({ default: m.PaymentCancel }))
);
const ContactMessages = lazy(() => import('./components/Admin/pages/ContactMessages'));
const Subscribers = lazy(() => import('./components/Admin/pages/Subscribers'));
const PromoVideosManagement = lazy(() => import('./components/Admin/pages/PromoVideosManagement'));
const DashboardLayout = lazy(() => import('./components/Admin/DashboardLayout'));
const DashboardHome = lazy(() => import('./components/Admin/DashboardHome'));
const ResearchMainPage = lazy(() => import('./components/Pages/ResearchMainPage'));
const ResearchPostPage = lazy(() => import('./components/Pages/ResearchPostPage'));
const NotFoundPage = lazy(() => import('./components/Pages/NotFoundPage'));
const PortalLayout = lazy(() => import('./components/Portals/PortalLayout'));
const LmsManagement = lazy(() => import('./components/Admin/pages/LmsManagement'));
const ResourcesManagement = lazy(() => import('./components/Admin/pages/ResourcesManagement'));
const StudentDashboard = lazy(() => import('./components/Portals/student/StudentDashboard'));
const StudentCourses = lazy(() => import('./components/Portals/student/StudentCourses'));
const StudentFees = lazy(() => import('./components/Portals/student/StudentFees'));
const StudentAssignments = lazy(() => import('./components/Portals/student/StudentAssignments'));
const StudentQuizzes = lazy(() => import('./components/Portals/student/StudentQuizzes'));
const StudentContent = lazy(() => import('./components/Portals/student/StudentContent'));
const StudentSchedule = lazy(() => import('./components/Portals/student/StudentSchedule'));
const StudentAttendance = lazy(() => import('./components/Portals/student/StudentAttendance'));
const TeacherDashboard = lazy(() => import('./components/Portals/teacher/TeacherDashboard'));
const TeacherClasses = lazy(() => import('./components/Portals/teacher/TeacherClasses'));
const TeacherAttendance = lazy(() => import('./components/Portals/teacher/TeacherAttendance'));
const TeacherContent = lazy(() => import('./components/Portals/teacher/TeacherContent'));
const TeacherResources = lazy(() => import('./components/Portals/teacher/TeacherResources'));
const TeacherMyAttendance = lazy(() => import('./components/Portals/teacher/TeacherMyAttendance'));
const TeacherQuizzes = lazy(() => import('./components/Portals/teacher/TeacherQuizzes'));
const ParentDashboard = lazy(() => import('./components/Portals/parent/ParentDashboard'));
const ParentChildren = lazy(() => import('./components/Portals/parent/ParentChildren'));
const ParentSchedule = lazy(() => import('./components/Portals/parent/ParentSchedule'));
const ParentProgress = lazy(() => import('./components/Portals/parent/ParentProgress'));
const AccountantDashboard = lazy(() => import('./components/Portals/accountant/AccountantDashboard'));
const AccountantPayments = lazy(() => import('./components/Portals/accountant/AccountantPayments'));
const AccountantPayroll = lazy(() => import('./components/Portals/accountant/AccountantPayroll'));
const AccountantReports = lazy(() => import('./components/Portals/accountant/AccountantReports'));
const PortalAccountSettings = lazy(() => import('./components/Portals/shared/PortalAccountSettings'));

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="route-loading-fallback"
      style={{
        minHeight: '40vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--body-color, #333)',
        fontSize: '1rem',
      }}
    >
      Loading…
    </div>
  );
}

const Home = () => {
  return (
    <div className="front_page">
      <SubscribePopup />
      {/* Hero Section - Full width, not constrained */}
      <HeroSection />

      {/* Other sections */}
      <MissionSection />
      <CoursesSection />
      <VideoSection placement="home" />
      {/* <MarqueeSection /> */}
      <AboutSection />
      <StudentTestimonialsSection />
      <WhyGorythmSection />
      <SubscribeSection />
      <ResearchSection />
    </div>
  );
};

function AppLayout() {
  const location = useLocation();
  usePageCanonical();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isPortalLmsRoute = /^\/(student|teacher|parent|accountant)(\/|$)/.test(location.pathname);
  const isPublicLoginRoute = location.pathname === '/login';
  const hideSiteFooter = isAdminRoute || isPublicLoginRoute || isPortalLmsRoute;
  const showCustomCursor = !isAdminRoute && !isPortalLmsRoute;

  return (
    <SmoothScroll>
      <RoutePageMeta />
      <div
        className={[
          'academy-app',
          isAdminRoute ? 'admin-route' : null,
          isPortalLmsRoute ? 'portal-lms-route' : null,
          isPublicLoginRoute ? 'public-login-route' : null,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {showCustomCursor ? <Cursor /> : null}

        <Header />

        <ScrollToTop />

        <main className="main-content">
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/courses" element={<AllCourses />} />
              <Route path="/courses/:slug" element={<SingleCourse />} />
              <Route path="/payment" element={<PaymentGateway />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              <Route path="/payment-cancel" element={<PaymentCancel />} />
              <Route path="/instructors" element={<Navigate to="/about" replace />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/login" element={<Login />} />

              {/* Mission detail pages */}
              <Route path="/mission/iq" element={<IqMissionPage />} />
              <Route path="/mission/eq" element={<EqMissionPage />} />
              <Route path="/mission/phq" element={<PhqMissionPage />} />
              <Route path="/mission/satellite-maintenance" element={<Navigate to="/mission/iq" replace />} />
              <Route path="/mission/exploration-missions" element={<Navigate to="/mission/eq" replace />} />
              <Route path="/mission/research-and-observation" element={<Navigate to="/mission/phq" replace />} />

              {/* Research */}
              <Route path="/research/:slug" element={<ResearchPostPage />} />
              <Route path="/research" element={<ResearchMainPage />} />

              {/* Admin Login Route */}
              <Route path="/admin/login" element={<AdminLogin />} />

              {/* Protected Admin Routes */}
              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={['super-admin', 'manager']}
                    loginPath="/admin/login"
                    authRealm={AUTH_REALM.ADMIN}
                  />
                }
              >
                <Route path="/admin/*" element={<DashboardLayout />}>
                  <Route index element={<DashboardHome />} />
                  <Route path="dashboard" element={<DashboardHome />} />
                  <Route path="users" element={<UsersManagement key="staff-users-tab" variant="staff" />} />
                  <Route path="people" element={<Navigate to="/admin/students" replace />} />
                  <Route path="students" element={<StudentsData />} />
                  <Route path="students-data" element={<Navigate to="/admin/students" replace />} />
                  <Route path="teachers" element={<UsersManagement key="teachers-tab" variant="teachers" />} />
                  <Route path="parents" element={<UsersManagement key="parents-tab" variant="parents" />} />
                  <Route path="courses" element={<CoursesManagement />} />
                  <Route path="assignments" element={<ResourcesManagement defaultTab="assignments" />} />
                  <Route path="resources" element={<ResourcesManagement defaultTab="resources" />} />
                  <Route path="research" element={<ResourcesManagement defaultTab="research" />} />
                  <Route path="submissions" element={<ResourcesManagement defaultTab="submissions" />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="payments" element={<PaymentsManagement />} />
                  <Route path="lms" element={<LmsManagement />} />
                  <Route path="enrollments" element={<Navigate to="/admin/students" replace />} />
                  <Route path="contact-messages" element={<ContactMessages />} />
                  <Route path="research-comments" element={<Navigate to="/admin/assignments?tab=research&section=comments" replace />} />
                  <Route path="subscribers" element={<Subscribers />} />
                  <Route path="promo-videos" element={<PromoVideosManagement />} />
                </Route>
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={['student']}
                    loginPath="/login"
                    authRealm={AUTH_REALM.PORTAL}
                  />
                }
              >
                <Route path="/student/*" element={<PortalLayout role="student" title="Student Portal" />}>
                  <Route index element={<StudentDashboard />} />
                  <Route path="courses" element={<StudentCourses />} />
                  <Route path="fees" element={<StudentFees />} />
                  <Route path="assignments" element={<StudentAssignments />} />
                  <Route path="quizzes" element={<StudentQuizzes />} />
                  <Route path="content" element={<StudentContent />} />
                  <Route path="schedule" element={<StudentSchedule />} />
                  <Route path="attendance" element={<StudentAttendance />} />
                  <Route path="account" element={<PortalAccountSettings subtitle="Manage your student portal password." />} />
                  <Route path="*" element={<Navigate to="/student" replace />} />
                </Route>
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={['teacher']}
                    loginPath="/login"
                    authRealm={AUTH_REALM.PORTAL}
                  />
                }
              >
                <Route path="/teacher/*" element={<PortalLayout role="teacher" title="Teacher Portal" />}>
                  <Route index element={<TeacherDashboard />} />
                  <Route path="classes" element={<TeacherClasses />} />
                  <Route path="attendance" element={<TeacherAttendance />} />
                  <Route path="content" element={<TeacherContent />} />
                  <Route path="assignments" element={<Navigate to="/teacher/content" replace />} />
                  <Route path="resources" element={<TeacherResources />} />
                  <Route path="schedule" element={<Navigate to="/teacher/classes" replace />} />
                  <Route path="my-attendance" element={<TeacherMyAttendance />} />
                  <Route path="quizzes" element={<TeacherQuizzes />} />
                  <Route path="account" element={<PortalAccountSettings subtitle="Manage your teacher portal password." />} />
                  <Route path="*" element={<Navigate to="/teacher" replace />} />
                </Route>
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={['parent']}
                    loginPath="/login"
                    authRealm={AUTH_REALM.PORTAL}
                  />
                }
              >
                <Route path="/parent/*" element={<PortalLayout role="parent" title="Parent Portal" />}>
                  <Route index element={<ParentDashboard />} />
                  <Route path="children" element={<ParentChildren />} />
                  <Route path="schedule" element={<ParentSchedule />} />
                  <Route path="progress" element={<ParentProgress />} />
                  <Route path="account" element={<PortalAccountSettings subtitle="Manage your parent portal password." />} />
                  <Route path="*" element={<Navigate to="/parent" replace />} />
                </Route>
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={['accountant']}
                    loginPath="/login"
                    authRealm={AUTH_REALM.PORTAL}
                  />
                }
              >
                <Route path="/accountant/*" element={<PortalLayout role="accountant" title="Finance portal" />}>
                  <Route index element={<AccountantDashboard />} />
                  <Route path="payments" element={<AccountantPayments />} />
                  <Route path="payroll" element={<AccountantPayroll />} />
                  <Route path="reports" element={<AccountantReports />} />
                  <Route path="account" element={<PortalAccountSettings subtitle="Manage your finance portal password." />} />
                  <Route path="*" element={<Navigate to="/accountant" replace />} />
                </Route>
              </Route>

              {/* Redirect to home */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
        {!hideSiteFooter && <FooterSimple />}
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
