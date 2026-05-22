import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getAuthSession, AUTH_REALM } from '../../utils/authStorage';
import {
  isAdminPortalPreviewEnabled,
  isAdminRole,
  isViewingPortalAsAdmin,
} from '../../utils/adminPortalPreview';

const ProtectedRoute = ({
  allowedRoles,
  loginPath = '/login',
  allowAdminPortalPreview = false,
  authRealm = AUTH_REALM.PORTAL,
}) => {
  const location = useLocation();
  let { token, user } = getAuthSession(authRealm);

  if ((!token || !user) && allowAdminPortalPreview && isViewingPortalAsAdmin()) {
    const adminSession = getAuthSession(AUTH_REALM.ADMIN);
    token = adminSession.token;
    user = adminSession.user;
  }

  if (!token || !user) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (user.mustChangePassword) {
    const adminRoles = ['super-admin', 'admin'];
    if (adminRoles.includes(user.role)) {
      return <Navigate to="/admin/login?reset=1" replace />;
    }
    return <Navigate to="/login?reset=1" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (authRealm === AUTH_REALM.ADMIN) {
      return (
        <Navigate
          to="/admin/login"
          replace
          state={{
            message:
              'This area is for admin accounts only. Sign in at Admin login, or use the public Login page for student/teacher portals.',
          }}
        />
      );
    }

    const portalPreviewOk =
      allowAdminPortalPreview &&
      isAdminPortalPreviewEnabled() &&
      isAdminRole(user.role);
    if (!portalPreviewOk) {
      return <Navigate to={loginPath} replace />;
    }
  }

  return <Outlet />;
};

export default ProtectedRoute;
