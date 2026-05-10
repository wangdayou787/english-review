/**
 * Middleware: require user to be logged in.
 * Redirects to /login with returnTo query param if not authenticated.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  const returnTo = encodeURIComponent(req.originalUrl);
  res.redirect(`/login?returnTo=${returnTo}`);
}

/**
 * Middleware: require user to be admin.
 * Sends 403 if authenticated but not admin.
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).send('无权访问：需要管理员权限');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
