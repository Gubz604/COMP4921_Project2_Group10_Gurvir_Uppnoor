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
const { upload } = require('./lib/upload')

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
app.use(express.json());

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
    res.locals.profileImage = req.session?.profileImage || null;
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

    // after successful login:
    req.session.authenticated = true;
    req.session.email = req.body.email;
    req.session.displayName = req.body.displayName;
    const meRows = await db_user.getUserId({ email: req.body.email });
    const meId = meRows?.[0]?.user_id;
    const me = meId ? await db_user.getUserById({ userId: meId }) : null;
    req.session.profileImage = me?.profile_image || null;

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

    // after successful login:
    req.session.authenticated = true;
    req.session.email = user.email;
    req.session.displayName = user.display_name;
    const meRows = await db_user.getUserId({ email: user.email });
    const meId = meRows?.[0]?.user_id;
    const me = meId ? await db_user.getUserById({ userId: meId }) : null;
    req.session.profileImage = me?.profile_image || null;

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

// app.js  (GET /thread)
app.get('/thread', async (req, res) => {
    try {
        const threadId = Number(req.query.threadId || 0);
        if (!threadId) return res.status(400).render('errorMessage', { error: 'Missing threadId' });

        const rowsUid = await db_user.getUserId({ email: req.session.email });
        const userId = rowsUid?.[0]?.user_id || null;

        // always increment on open
        await db_thread.incrementViews({ threadId });

        // fetch fresh row AFTER increment so UI shows new count
        const thread = await db_thread.getThreadWithOwner({ threadId, userId });
        if (!thread) return res.status(404).render('404', { title: 'Not Found' });

        const flat = await db_thread.listCommentsForThread({ threadId, userId });
        const comments = buildCommentTreeFromFlat(flat);

        return res.render('thread', { title: thread.title, thread, comments, me: userId });
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

app.get('/home', async (req, res) => {
    try {
        const [recentThreads, popularThreads] = await Promise.all([
            db_thread.listRecentThreads(3),
            db_thread.listPopularThreads(3)
        ]);

        const rawQ = String(req.query.q || '').toLowerCase();
        let searchResults = [];
        let q = '';
        const tokens = Array.from(new Set(rawQ.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)));

        if (tokens.length > 0) {
            q = rawQ;
            const qFT = tokens.join(' ');
            const candidates = await db_thread.fulltextCandidates({ q: qFT, limit: 200 });
            if (candidates.length > 0) {
                const ids = candidates.map(r => r.thread_id);
                const placeholders = ids.map(() => '?').join(',');
                const [docs] = await require('./databaseConnection').query(
                    `SELECT thread_id, doc FROM thread_search_docs WHERE thread_id IN (${placeholders})`,
                    ids
                );
                const docMap = new Map(docs.map(r => [r.thread_id, r.doc || '']));
                const countWord = (doc, word) => {
                    if (!doc) return 0;
                    const needle = ` ${word} `;
                    let i = 0, c = 0;
                    while ((i = doc.indexOf(needle, i)) !== -1) { c++; i += needle.length; }
                    return c;
                };
                const enriched = candidates.map(r => {
                    const doc = docMap.get(r.thread_id) || '';
                    const freq = tokens.reduce((acc, w) => acc + countWord(doc, w), 0);
                    return { ...r, freq };
                });
                enriched.sort((a, b) =>
                    b.freq - a.freq || b.ft_score - a.ft_score || new Date(b.created_at) - new Date(a.created_at)
                );
                searchResults = enriched.slice(0, 50);
            }
        }

        res.render('home', {
            title: 'Home',
            displayName: req.session.displayName,
            recentThreads,
            popularThreads,
            q,
            searchResults
        });
    } catch (e) {
        console.error('GET /home error:', e);
        res.status(500).render('errorMessage', { error: 'Could not load home' });
    }
});



app.post('/logout', (req, res, next) => {
    req.session.destroy(err => {
        if (err) return next(err);
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

app.post('/thread/:threadId/like', requireAuth(), async (req, res) => {
    try {
        const threadId = Number(req.params.threadId);
        const rows = await db_user.getUserId({ email: req.session.email });
        const userId = rows?.[0]?.user_id;
        if (!threadId || !userId) return res.status(400).json({ ok: false });

        const action = req.body.action; // 'like' | 'unlike'
        let result;
        if (action === 'like') result = await db_thread.likeThread({ threadId, userId });
        else if (action === 'unlike') result = await db_thread.unlikeThread({ threadId, userId });
        else return res.status(400).json({ ok: false, error: 'bad action' });

        // return fresh count
        const fresh = await db_thread.getThreadWithOwner({ threadId, userId });
        res.json({ ok: true, likedByMe: action === 'like', likesCount: fresh.likes_count, changed: result.changed });
    } catch (e) {
        console.error('POST /thread/:threadId/like', e);
        res.status(500).json({ ok: false });
    }
});

app.post('/comment/:commentId/like', requireAuth(), async (req, res) => {
    try {
        const commentId = Number(req.params.commentId);
        const rows = await db_user.getUserId({ email: req.session.email });
        const userId = rows?.[0]?.user_id;

        if (!commentId || !userId) {
            return res.status(400).json({ ok: false });
        }

        const action = req.body?.action; // 'like' | 'unlike'
        if (!['like', 'unlike'].includes(action)) {
            return res.status(400).json({ ok: false, error: 'bad action' });
        }

        let result;
        if (action === 'like') {
            result = await db_comment.likeComment({ commentId, userId });
        } else {
            result = await db_comment.unlikeComment({ commentId, userId });
        }

        const likesCount = await db_comment.getLikesCount({ commentId });

        return res.json({
            ok: true,
            likesCount,
            changed: result.changed
        });
    } catch (e) {
        console.error('POST /comment/:commentId/like', e);
        return res.status(500).json({ ok: false });
    }
});

// Show inline edit not needed server-side; we do JSON API
app.post('/comment/:commentId/edit', requireAuth(), async (req, res) => {
    try {
        const commentId = Number(req.params.commentId);
        const newBody = (req.body?.body || '').trim();
        if (!commentId || !newBody) return res.status(400).json({ ok: false, error: 'bad input' });

        const rows = await db_user.getUserId({ email: req.session.email });
        const userId = rows?.[0]?.user_id;
        if (!userId) return res.status(401).json({ ok: false });

        // ensure comment exists and belongs to user
        const c = await db_comment.getCommentById({ commentId });
        if (!c) return res.status(404).json({ ok: false, error: 'not found' });
        if (c.author_id !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });

        const ok = await db_comment.updateCommentBody({ commentId, authorId: userId, newBody });
        if (!ok) return res.status(500).json({ ok: false });

        // return updated fields
        return res.json({ ok: true, body: newBody, updatedAt: new Date().toISOString() });
    } catch (e) {
        console.error('POST /comment/:commentId/edit', e);
        return res.status(500).json({ ok: false });
    }
});

app.post('/comment/:commentId/delete', requireAuth(), async (req, res) => {
    try {
        const commentId = Number(req.params.commentId);
        if (!commentId) return res.status(400).json({ ok: false, error: 'bad id' });

        const rows = await db_user.getUserId({ email: req.session.email });
        const userId = rows?.[0]?.user_id;
        if (!userId) return res.status(401).json({ ok: false });

        const ok = await db_comment.softDeleteByThreadOwner({ commentId, ownerUserId: userId });
        if (!ok) return res.status(403).json({ ok: false, error: 'forbidden' });

        return res.json({ ok: true, commentId, masked: { author_name: 'deleted', body: '[deleted]' } });
    } catch (e) {
        console.error('POST /comment/:commentId/delete', e);
        return res.status(500).json({ ok: false });
    }
});

app.get('/profile', requireAuth(), async (req, res) => {
    const rows = await db_user.getUserId({ email: req.session.email });
    const userId = rows?.[0]?.user_id;
    const me = userId ? await db_user.getUserById({ userId }) : null;

    const myThreads = userId ? await db_thread.listThreadsByOwner({ userId }) : [];

    return res.render('profile', {
        title: 'Your Profile',
        me,
        myThreads
    });
});


// Upload avatar
app.post('/profile/avatar', requireAuth(), upload.single('avatar'), async (req, res) => {
    try {
        // multer-storage-cloudinary sets:
        // req.file.path    -> secure URL
        // req.file.filename-> public_id
        if (!req.file?.path) {
            req.session.flash = { type: 'danger', text: 'No file received.' };
            return res.redirect('/profile');
        }

        const rows = await db_user.getUserId({ email: req.session.email });
        const userId = rows?.[0]?.user_id;
        if (!userId) {
            req.session.flash = { type: 'danger', text: 'Not signed in.' };
            return res.redirect('/loginForm');
        }

        await db_user.setProfileImage({
            userId,
            url: req.file.path,
            publicId: req.file.filename
        });

        // Also expose in session for header
        req.session.profileImage = req.file.path;

        req.session.flash = { type: 'success', text: 'Profile image updated.' };
        res.redirect('/profile');
    } catch (e) {
        console.error('POST /profile/avatar error:', e);
        req.session.flash = { type: 'danger', text: 'Upload failed.' };
        res.redirect('/profile');
    }
});

// util: in-file Fisher–Yates
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// START a new scroll session every time user hits /scroll
app.get('/scroll', requireAuth(), async (req, res) => {
  try {
    const ids = await db_thread.listAllThreadIds();      // all current threads
    if (!ids.length) return res.render('errorMessage', { error: 'No threads available.' });

    shuffleInPlace(ids);
    req.session.scrollQueue = ids;                       // sequence for THIS visit
    req.session.save(() => res.redirect('/scroll/next')); // start at first item
  } catch (e) {
    console.error('GET /scroll error', e);
    res.status(500).render('errorMessage', { error: 'Could not start scroll.' });
  }
});

// SHOW next thread in the current session queue
app.get('/scroll/next', requireAuth(), async (req, res) => {
  try {
    let q = Array.isArray(req.session.scrollQueue) ? req.session.scrollQueue : null;
    if (!q || q.length === 0) {
      // no queue or finished -> offer restart
      return res.render('scroll', { thread: null, remaining: 0 });
    }

    const threadId = q.shift();                          
    req.session.scrollQueue = q;                         

    // track a view whenever shown
    await db_thread.incrementViews({ threadId });

    // get thread with owner for rendering
    const rowsUid = await db_user.getUserId({ email: req.session.email });
    const userId = rowsUid?.[0]?.user_id || null;
    const thread = await db_thread.getThreadWithOwner({ threadId, userId });
    if (!thread) return res.redirect('/scroll');         // skip if missing

    res.render('scroll', { thread, remaining: q.length });
  } catch (e) {
    console.error('GET /scroll/next error', e);
    res.status(500).render('errorMessage', { error: 'Could not load next thread.' });
  }
});

// 404
app.use((req, res) => res.status(404).render('404', { title: 'Not Found' }));

app.listen(port, () => {
    console.log(`http://localhost:${port}`);
});


// helper placed near the route (or in a util file)
function buildCommentTreeFromFlat(rows) {
    const byId = new Map();
    rows.forEach(r => {
        byId.set(r.comment_id, {
            comment_id: r.comment_id,
            parent_comment_id: r.parent_comment_id,
            author_id: r.author_id,
            author_name: r.author_name,
            profile_image: r.profile_image,
            body: r.body_masked,
            created_at: r.created_at,
            updated_at: r.updated_at,
            likes_count: r.likes_count || 0,
            liked_by_me: !!r.liked_by_me,
            is_deleted: !!r.is_deleted,
            deleted_at: r.deleted_at,
            children: []
        });
    });
    const roots = [];
    byId.forEach(node => {
        if (node.parent_comment_id && byId.has(node.parent_comment_id)) {
            byId.get(node.parent_comment_id).children.push(node);
        } else roots.push(node);
    });
    return roots;
}