import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getAuthToken, getAuthUserJson } from '../../utils/authStorage';

const ProtectedRoute = ({ allowedRoles, loginPath = '/login' }) => {
  const token = getAuthToken();
  const rawUser = getAuthUserJson();

  if (!token || !rawUser) {
    return <Navigate to={loginPath} replace />;
  }

  try {
    const user = JSON.parse(rawUser);
    if (user.mustChangePassword) {
      const adminRoles = ['super-admin', 'admin'];
      if (adminRoles.includes(user.role)) {
        return <Navigate to="/admin/login?reset=1" replace />;
      }
      return <Navigate to="/login?reset=1" replace />;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return <Navigate to="/" replace />;
    }
  } catch (error) {
    return <Navigate to={loginPath} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
