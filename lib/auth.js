function isAuthenticated(req) {
    return Boolean(
        req.session &&
        req.session.authenticated === true &&
        typeof req.session.email === 'string' &&
        req.session.email.trim() !== ''
    );
}

function requireAuth(options = {}) {
    const redirectTo = options.redirectTo ?? '/loginForm';
    const respondJson = options.json === true;

    return (req, res, next) => {
        if (isAuthenticated(req)) return next();

        if (respondJson) return res.status(401).json({ error: 'Unauthorized' });
        return res.redirect(redirectTo);
    };
}

module.exports = { isAuthenticated, requireAuth };
