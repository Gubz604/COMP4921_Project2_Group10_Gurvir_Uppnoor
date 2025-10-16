require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

const saltRounds = 12;

const db_utils = require('./database/db_utils');
const db_user = require('./database/users');
const db_thread = require('./database/threads');
const { requireAuth } = require('./lib/auth');

db_utils.printMySQLVersion();

const port = process.env.PORT || 3000;
const app = express();
const expireTime = 60 * 60 * 1000;

/* ----------------------- SECRET INFORMATION ----------------------------*/
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;
/* ----------------------- END OF SECRET INFORMATION ----------------------*/

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));

const mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://gubzywubzy:${mongodb_password}@gurvircluster.vjdfpla.mongodb.net/?retryWrites=true&w=majority&appName=GurvirCluster`,
    crypto: { secret: mongodb_session_secret }
});

app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}));

// Simple flash messages
app.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    next();
});

// Expose auth state to templates
app.use((req, res, next) => {
    res.locals.isAuth = !!req.session?.authenticated;
    res.locals.userEmail = req.session?.email || null;
    next();
});

app.use(express.static('public'));

/* ----------------------- HELPERS ---------------------------------------*/
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

/* ----------------------- ROUTES ----------------------------------------*/
app.get('/', (req, res) => res.render('index', { title: 'Home' }));

app.get('/signupForm', (req, res) => {
    res.render('signup', {
        title: 'Sign Up',
        error: null,
        fields: { email: '', displayname: '' },
        fieldErrors: {}
    });
});

app.get('/loginForm', (req, res) => {
    res.render('login', {
        title: 'Log In',
        error: null,
        fields: { email: '' },
        fieldErrors: {}
    });
});

app.post('/signup', async (req, res) => {
    const { email, password, displayname } = req.body;

    const fields = { email: email || '', displayname: displayname || '' };
    const fieldErrors = {};

    if (!emailOk(email)) fieldErrors.email = 'Enter a valid email.';
    if (!nonEmpty(displayname) || displayname.trim().length < 2) fieldErrors.displayname = 'Display name is too short.';
    if (!nonEmpty(password) || password.length < 8) fieldErrors.password = 'Password must be at least 8 characters.';

    if (Object.keys(fieldErrors).length) {
        return res.status(400).render('signup', {
            title: 'Sign Up',
            error: 'Fix the errors and try again.',
            fields,
            fieldErrors
        });
    }

    const existing = await db_user.getUser({ email });
    if (existing && existing.length > 0) {
        return res.status(409).render('signup', {
            title: 'Sign Up',
            error: 'An account with that email already exists.',
            fields,
            fieldErrors: { email: 'Email already in use.' }
        });
    }

    const hashedPassword = bcrypt.hashSync(password, saltRounds);
    const ok = await db_user.createUser({ email, hashedPassword, displayName: displayname });
    if (!ok) {
        return res.status(500).render('signup', {
            title: 'Sign Up',
            error: 'Could not create the account. Try again.',
            fields,
            fieldErrors: {}
        });
    }

    req.session.authenticated = true;
    req.session.email = email;
    req.session.displayName = displayname; // already known
    req.session.cookie.maxAge = expireTime;
    res.redirect('/home');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const fields = { email: email || '' };
    const fieldErrors = {};

    if (!emailOk(email)) fieldErrors.email = 'Enter a valid email.';
    if (!nonEmpty(password)) fieldErrors.password = 'Password is required.';

    if (Object.keys(fieldErrors).length) {
        return res.status(400).render('login', {
            title: 'Log In',
            error: 'Fix the errors and try again.',
            fields,
            fieldErrors
        });
    }

    const found = await db_user.getUser({ email });
    if (!found || found.length !== 1) {
        return res.status(401).render('login', {
            title: 'Log In',
            error: 'No account exists for that email.',
            fields,
            fieldErrors: { email: 'Unknown email.' }
        });
    }

    const user = found[0]; // has display_name now
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
        return res.status(401).render('login', {
            title: 'Log In',
            error: 'Incorrect password.',
            fields,
            fieldErrors: { password: 'Incorrect password.' }
        });
    }

    req.session.authenticated = true;
    req.session.email = user.email;
    req.session.displayName = user.display_name; // use from same row
    req.session.cookie.maxAge = expireTime;
    res.redirect('/home');
});

app.get('/createThread', requireAuth(), (req, res) => {
    res.render('createThread', { title: 'Create Thread' });
});

app.post('/submitThread', requireAuth(), async (req, res) => {
    const { title, description } = req.body;
    const email = req.session.email;

    if (!nonEmpty(title) || !nonEmpty(description)) {
        return res.status(400).render('errorMessage', { error: 'Title and description are required' });
    }

    const user_id = await db_user.getUserId({ email });
    if (!user_id || user_id.length !== 1) {
        return res.status(500).render('errorMessage', { error: 'Could not find user' });
    }

    const id = user_id[0].user_id;
    await db_thread.createThread({ userId: id, title, description });

    const thread_id = await db_thread.getThreadId({ userId: id, title });
    if (!thread_id || thread_id.length !== 1) {
        return res.status(500).render('errorMessage', { error: 'Could not retrieve thread id' });
    }

    res.redirect('/thread?threadId=' + thread_id[0].thread_id);
});

// server.js
app.get('/thread', requireAuth(), async (req, res) => {
    const threadId = Number(req.query.threadId || 0);
    if (!threadId) return res.status(400).render('errorMessage', { error: 'Missing threadId' });

    const thread = await db_thread.getThreadWithOwner({ threadId });
    if (!thread) return res.status(404).render('404', { title: 'Not Found' });

    res.render('thread', {
        title: thread.title,
        thread,
    });
});

app.get('/home', requireAuth(), async (req, res) => {
    const recentThreads = await db_thread.listRecentThreads(3);
    res.render('home', {
        title: 'Home',
        displayName: req.session.displayName,
        recentThreads
    });
});

app.post('/logout', (req, res, next) => {
    req.session.destroy(err => {
        if (err) return next(err);
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// 404
app.use((req, res) => res.status(404).render('404', { title: 'Not Found' }));

app.listen(port, () => {
    console.log(`http://localhost:${port}`);
});
