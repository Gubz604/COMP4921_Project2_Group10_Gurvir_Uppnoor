require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
saltRounds = 12;

const database = require('./databaseConnection');
const db_utils = require('./database/db_utils');
const db_user = require('./database/users');
const db_thread = require('./database/threads');
const { uploadImage } = require('./lib/upload');
const { isAuthenticated, requireAuth } = require('./lib/auth');
const success = db_utils.printMySQLVersion();

const port = process.env.PORT || 3000;

const app = express();

const expireTime = 60 * 60 * 1000; // expires after 1 hour

/* ----------------------- SECRET INFORMATION ----------------------------*/
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* ----------------------- END OF SECRET INFORMATION ----------------------*/

app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: false }));

var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://gubzywubzy:${mongodb_password}@gurvircluster.vjdfpla.mongodb.net/?retryWrites=true&w=majority&appName=GurvirCluster`,
    crypto: { secret: mongodb_session_secret }
});

app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}));

app.use(express.static('public'));

/* ----------------------- ROUTES -----------------------------------------*/

// LOGIN/SIGNUP
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/signupForm', (req, res) => {
    res.render('signup');
});

app.post('/loginForm', (req, res) => {
    res.render('login');
});

app.post('/signup', async (req, res) => {
    var email = req.body.email;
    var password = req.body.password;
    var displayName = req.body.displayname;

    var hashedPassword = bcrypt.hashSync(password, saltRounds);

    var success = await db_user.createUser({ email: email, hashedPassword: hashedPassword, displayName: displayName });

    if (success) {
        console.log(`Email: ${email} created successfully`);
        req.session.authenticated = true;
        req.session.email = email;
        req.session.cookie.maxAge = expireTime;
        res.render('home', { email: req.session.email });
    } else {
        res.render('errorMessage', { error: "Error creating user" });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user_db = await db_user.getUser({ email: email });

    if (user_db && user_db.length === 1) {
        const user = user_db[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            req.session.authenticated = true;
            req.session.email = email;
            req.session.cookie.maxAge = expireTime;
            return res.redirect('/home');
        } else {
            console.log('Invalid Password');
            return res.redirect('/loginForm'); // Possibly render login.ejs with an error message 
        }
    } else {
        console.log('Error logging in user');
        return res.render('errorMessage', { error: "Invalid username or password" });
    }
});

app.get('/home', requireAuth(), (req, res) => {
    res.render('home', { email: req.session.email });
});

app.get('/createThread', requireAuth(), (req, res) => {
    res.render('createThread');
});

app.post('/submitThread', async (req, res) => {
    const { title, description } = req.body;
    const email = req.session.email;

    if (!title || !description) {
        return res.status(400).render('errorMessage', { error: 'Title and description are required' });
    }

    const user_id = await db_user.getUserId({ email: email });
    console.log(user_id[0].user_id);

    if (user_id && user_id.length === 1) {
        const id = user_id[0].user_id;
        await db_thread.createThread({ userId: id, title: title, description: description });
    } else {
        console.log('Error retreiving user_id');
        return res.render('errorMessage', { error: "Could not find user" });
    }

    const thread_id = await db_thread.getThreadId({ userId: user_id[0].user_id, title: title });
    console.log('thread_id is: ' + thread_id);
    if (thread_id && thread_id.length === 1) {
        const thisThread = thread_id[0].thread_id;
        return res.redirect('/thread?threadId=' + thisThread);
    } else {
        console.log('Error returning thread_id');
        return res.render('errorMessage', { error: "Could not retrieved thread_id" });
    }
});

app.get('/thread', requireAuth(), (req, res) => { 
    const threadId = req.query.threadId;  
    res.render('thread', { threadId: threadId });
});


app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.render('home');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});
// -------------- END OF ROUTES ----------------------------------*/

app.use((req, res) => {
    res.status(404).render("404");
});


app.listen(port, () => {
    console.log("Node application listening on port " + port);
    console.log("http://localhost:" + port);
});