const database = require('../databaseConnection');

async function createUser(postData) {
    let createUserSQL = `
        INSERT INTO users
        (email, password_hash, display_name)
        VALUES
        (:email, :passwordHash, :displayName);
        `;

    let params = {
        email: postData.email,
        passwordHash: postData.hashedPassword,
        displayName: postData.displayName
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
        SELECT email, password_hash
        FROM users
        WHERE email = :email;
        `;

    let params = {
        email: postData.email
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

async function getUserId(postData) {
    let getUserId = `
        SELECT user_id
        FROM users
        WHERE email = :email;
        `;

    let params = {
        email: postData.email
    }

    try {
        const result = await database.query(getUserId, params);

        console.log("Successfully queried the database for user id");
        return result[0];
    } catch (err) {
        console.log("Error trying to find user");
        console.log(err);
        return false;
    }
}

module.exports = { createUser, getUser, getUserId };