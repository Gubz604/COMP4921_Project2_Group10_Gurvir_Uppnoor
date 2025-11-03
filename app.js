require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

const saltRounds = 12;

const db_utils = require('./database/db_utils');
const db_user = require('./database/users');
const db_thread = require('./database/threads');
const db_comment = require('./database/comments');
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
app.use(express.urlencoded({ extended: true }));

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

// Create a thread
app.post('/submitThread', requireAuth(), async (req, res) => {
    try {
        const { title, description } = req.body;

        if (!title?.trim() || !description?.trim()) {
            return res.status(400).render('errorMessage', { error: 'Title and description are required.' });
        }

        const rows = await db_user.getUserId({ email: req.session.email });
        const userId = rows?.[0]?.user_id || null;

        const threadId = await db_thread.createThread({
            userId,
            title: title.trim(),
            description: description.trim(),
        });

        return res.redirect(`/thread?threadId=${threadId}`);
    } catch (err) {
        console.error('POST /submitThread error:', err);
        return res.status(500).render('errorMessage', { error: 'Failed to create thread' });
    }
});

app.get('/thread', requireAuth(), async (req, res) => {
    try {
        const threadId = Number(req.query.threadId || 0);
        if (!threadId) {
            return res.status(400).render('errorMessage', { error: 'Missing threadId' });
        }

        const thread = await db_thread.getThreadWithOwner({ threadId });
        if (!thread) {
            return res.status(404).render('404', { title: 'Not Found' });
        }

        // keep your existing query:
        const flat = await db_thread.listCommentsForThread({ threadId });
        console.log('flat comments:', flat.length);
        // build a nested structure for the view:
        const comments = buildCommentTreeFromFlat(flat);

        console.log('roots:', comments.length, comments.map(c => c.comment_id));

        return res.render('thread', { title: thread.title, thread, comments });
    } catch (err) {
        console.error('GET /thread error:', err);
        return res.status(500).render('errorMessage', { error: 'Could not load thread' });
    }
});


app.post('/thread/:threadId/comment', requireAuth(), async (req, res) => {
    try {
        const threadId = Number(req.params.threadId || 0);
        const rows = await db_user.getUserId({ email: req.session.email });
        const userId = rows?.[0]?.user_id || null;
        const { body, parent_comment_id } = req.body;

        if (!threadId) return res.status(400).render('errorMessage', { error: 'Missing threadId' });
        if (!userId) return res.status(401).render('errorMessage', { error: 'Not signed in' });
        if (!body?.trim()) return res.redirect(`/thread?threadId=${threadId}`);

        // sanitize/normalize parent id (empty string -> null)
        const parentId = parent_comment_id ? Number(parent_comment_id) : null;

        // OPTIONAL but wise: ensure the parent exists in this thread (prevents cross-thread replies)
        if (parentId) {
            const ok = await db_comment.parentExistsInThread({ threadId, parentCommentId: parentId });
            if (!ok) return res.status(400).render('errorMessage', { error: 'Invalid parent comment' });
        }

        await db_comment.addComment({
            threadId,
            authorId: userId,
            body: body.trim(),
            parentCommentId: parentId
        });

        return res.redirect(`/thread?threadId=${threadId}`);
    } catch (err) {
        console.error('POST /thread/:threadId/comment error:', err);
        return res.status(500).render('errorMessage', { error: 'Failed to save comment' });
    }
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


// helper placed near the route (or in a util file)
function buildCommentTreeFromFlat(rows) {
    // rows expected to have: comment_id, parent_comment_id, body, created_at, author_name, etc.
    const byId = new Map();
    rows.forEach(r => {
        byId.set(r.comment_id, {
            // keep your existing field names so the EJS can use them directly
            comment_id: r.comment_id,
            parent_comment_id: r.parent_comment_id,
            body: r.body,
            created_at: r.created_at,
            author_name: r.author_name,
            // any other fields you already select…
            children: []
        });
    });

    const roots = [];
    byId.forEach(node => {
        if (node.parent_comment_id && byId.has(node.parent_comment_id)) {
            byId.get(node.parent_comment_id).children.push(node);
        } else {
            roots.push(node);
        }
    });

    return roots;
}