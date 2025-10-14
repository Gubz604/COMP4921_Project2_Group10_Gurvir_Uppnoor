require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
saltRounds = 12;

const database = require('./databaseConnection');
const db_utils = require('./database/db_utils');
const db_user = require('./database/users');
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
    var username = req.body.username;
    var password = req.body.password;

    var hashedPassword = bcrypt.hashSync(password, saltRounds);

    var success = await db_user.createUser({ user: username, hashedPassword: hashedPassword });

    if (success) {
        console.log(`User: ${username} created successfully`);
        req.session.authenticated = true;
        req.session.username = username;
        req.session.cookie.maxAge = expireTime;
        res.render('home', { username: req.session.username });
    } else {
        res.render('errorMessage', { error: "Error creating user" });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const user_db = await db_user.getUser({ user: username });

    if (user_db && user_db.length === 1) {
        const user = user_db[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            req.session.authenticated = true;
            req.session.username = username;
            req.session.cookie.maxAge = expireTime;
            return res.render('home', { username: req.session.username });
        } else {
            console.log('Invalid Password');
            return res.redirect('/loginForm'); // Possibly render login.ejs with an error message 
        }
    } else {
        console.log('Error logging in user');
        return res.render('errorMessage', { error: "Invalid username or password" });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.render('home');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
})
/* ----------------------- END OF ROUTES ----------------------------------*/

app.use((req, res) => {
    res.status(404).render("404");
});


app.listen(port, () => {
    console.log("Node application listening on port " + port);
    console.log("http://localhost:" + port);
});