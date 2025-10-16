// database/users.js
const database = require('../databaseConnection');

async function createUser(postData) {
    const sql = `
    INSERT INTO users (email, password_hash, display_name)
    VALUES (:email, :passwordHash, :displayName);
  `;
    const params = {
        email: postData.email,
        passwordHash: postData.hashedPassword,
        displayName: postData.displayName
    };
    try {
        await database.query(sql, params);
        return true;
    } catch (err) {
        console.log("Error inserting user", err);
        return false;
    }
}

async function getUser(postData) {
    const sql = `
    SELECT user_id, email, password_hash, display_name
    FROM users
    WHERE email = :email;
  `;
    const params = { email: postData.email };
    try {
        const results = await database.query(sql, params);
        return results[0]; // array of rows
    } catch (err) {
        console.log("Error trying to find user", err);
        return false;
    }
}

async function getUserId(postData) {
    const sql = `SELECT user_id FROM users WHERE email = :email;`;
    const params = { email: postData.email };
    try {
        const result = await database.query(sql, params);
        return result[0];
    } catch (err) {
        console.log("Error trying to find user id", err);
        return false;
    }
}

async function getDisplayName(postData) {
    const sql = `SELECT display_name FROM users WHERE email = :email;`;
    const params = { email: postData.email };
    try {
        const result = await database.query(sql, params);
        return result[0]?.[0]?.display_name || null; 
    } catch (err) {
        console.log("Error trying to find display name", err);
        return null;
    }
}

module.exports = { createUser, getUser, getUserId, getDisplayName };
