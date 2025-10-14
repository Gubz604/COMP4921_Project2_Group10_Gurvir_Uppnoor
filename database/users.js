const database = require('../databaseConnection');

async function createUser(postData) {
    let createUserSQL = `
        INSERT INTO user
        (username, password)
        VALUES
        (:user, :passwordHash);
        `;

    let params = {
        user: postData.user,
        passwordHash: postData.hashedPassword
    }

    try {
        const results = await database.query(createUserSQL, params);

        console.log("Successfully created user");
        console.log(results[0]);
        return true;
    } catch (err) {
        console.log("Error inserting user");
        console.log(err);
        return false;
    }
}

async function getUser(postData) {
    let getUserSQL = `
        SELECT username, password
        FROM user
        WHERE username = :user;
        `;

    let params = {
        user: postData.user
    }

    try {
        const results = await database.query(getUserSQL, params);

        console.log("Successfully queried the database for user");
        return results[0];
    } catch (err) {
        console.log("Error trying to find user");
        console.log(err);
        return false;
    }
}

module.exports = { createUser, getUser };