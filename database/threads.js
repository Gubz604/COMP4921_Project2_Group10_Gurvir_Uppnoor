const database = require('../databaseConnection');

async function createThread(postData) {
    let createThreadSQL = `
        INSERT INTO threads
        (owner_id, title, body)
        VALUES
        (:userId, :title, :description)
        ;
    `

    let params = {
        userId: postData.userId,
        title: postData.title,
        description: postData.description
    }

    try {
        const results = await database.query(createThreadSQL, params);

        console.log("Successfully created thread");
        console.log(results[0]);
        return true;
    } catch (err) {
        console.log("Error inserting threads");
        console.log(err);
        return false;
    }
}

async function getThreadId(postData) {
    let getThreadIdSQL = `
        SELECT thread_id
        FROM threads
        WHERE owner_id = :userId AND title = :title
        ORDER BY created_at DESC
        LIMIT 1
        ;
    `
    let params = {
        userId: postData.userId,
        title: postData.title
    }

    try {
        const results = await database.query(getThreadIdSQL, params);

        console.log("Successfully queried threads database for getThreadId");
        console.log(results[0]);
        return results[0];
    } catch (err) {
        console.log("Error querying threads for getThreadId");
        console.log(err);
        return false;
    }
}

module.exports = { createThread, getThreadId };