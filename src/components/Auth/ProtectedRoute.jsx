import React, { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getAuthSession, clearAuthSession, AUTH_REALM } from '../../utils/authStorage';
import { portalHomeByRole } from '../../utils/portalHomeByRole';
import { ensureAdminSessionVerified } from '../../utils/adminAuthSession';
import { ensurePortalSessionVerified } from '../../utils/portalAuthSession';
import { restoreSessionFromCookie } from '../../utils/authSessionRestore';

const ProtectedRoute = ({
  allowedRoles,
  loginPath = '/login',
  authRealm = AUTH_REALM.PORTAL,
}) => {
  const location = useLocation();
  const { token, user } = getAuthSession(authRealm);
  const [gate, setGate] = useState(() => 'checking');
  const [liveUser, setLiveUser] = useState(user);
  // Identity of the session that already passed verification. Cookie restore
  // changes token/user (effect deps) mid-run; without this the effect would
  // re-run, flip back to "Verifying session…" and unmount the page.
  const verifiedKeyRef = useRef(null);
  const rolesKey = Array.isArray(allowedRoles) ? allowedRoles.join(',') : '*';

  useEffect(() => {
    let cancelled = false;

    const keyFor = (s) =>
      s && s.token && s.user ? `${authRealm}|${rolesKey}|${s.user.id}|${s.user.role}` : null;

    const run = async () => {
      const before = keyFor(getAuthSession(authRealm));
      if (before && before === verifiedKeyRef.current) return;

      setGate('checking');
      verifiedKeyRef.current = null;
      let session = getAuthSession(authRealm);

      // Remember-me off: sessionStorage is tab-scoped; cookie is browser-wide.
      // New tabs must hydrate from the httpOnly cookie before treating as anon.
      // Continue in this same run so the screen does not verify twice.
      if (!session.token || !session.user) {
        session = (await restoreSessionFromCookie(authRealm)) || { token: null, user: null };
        if (cancelled) return;
      }

      if (!session.token || !session.user) {
        if (!cancelled) {
          setLiveUser(null);
          setGate('anon');
        }
        return;
      }

      try {
        const live =
          authRealm === AUTH_REALM.ADMIN
            ? await ensureAdminSessionVerified()
            : await ensurePortalSessionVerified();

        if (cancelled) return;

        if (!live) {
          setLiveUser(null);
          setGate('anon');
          return;
        }

        setLiveUser(live);

        if (live.mustChangePassword) {
          setGate('mustChange');
          return;
        }

        if (allowedRoles && !allowedRoles.includes(live.role)) {
          if (authRealm === AUTH_REALM.ADMIN) {
            await clearAuthSession(AUTH_REALM.ADMIN);
          }
          if (cancelled) return;
          setGate('forbidden');
          return;
        }

        verifiedKeyRef.current = keyFor(getAuthSession(authRealm));
        setGate('ok');
      } catch {
        // Network/server blip: keep cached session; API interceptors still handle 401.
        if (cancelled) return;
        const cached = getAuthSession(authRealm);
        if (!cached.token || !cached.user) {
          setGate('anon');
          return;
        }
        if (cached.user.mustChangePassword) {
          setLiveUser(cached.user);
          setGate('mustChange');
          return;
        }
        if (allowedRoles && !allowedRoles.includes(cached.user.role)) {
          setGate('forbidden');
          return;
        }
        setLiveUser(cached.user);
        setGate('ok');
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allowedRoles tracked via rolesKey
  }, [authRealm, rolesKey, token, user?.id, user?.role]);

  if (gate === 'checking') {
    return (
      <div className="auth-login" style={{ minHeight: '40vh' }}>
        <div className="auth-login__center">
          <p className="auth-login__subtitle" role="status">
            Verifying session…
          </p>
        </div>
      </div>
    );
  }

  if (gate === 'anon' || !liveUser) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (gate === 'mustChange') {
    if (authRealm === AUTH_REALM.ADMIN) {
      return <Navigate to="/admin/login?set-password=1" replace />;
    }
    return <Navigate to="/login?set-password=1" replace />;
  }

  if (gate === 'forbidden') {
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

    return (
      <Navigate
        to={portalHomeByRole(liveUser.role)}
        replace
        state={{ message: 'You do not have access to that portal area.' }}
      />
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;
