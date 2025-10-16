// database/threads.js
const database = require('../databaseConnection');

async function createThread({ userId, title, description }) {
  const sql = `
    INSERT INTO threads (owner_id, title, body)
    VALUES (:uid, :title, :body)
  `;
  const params = { uid: userId, title, body: description };
  await database.query(sql, params);
  return true;
}

async function getThreadId({ userId, title }) {
  const sql = `
    SELECT thread_id FROM threads
    WHERE owner_id = :uid AND title = :title
    ORDER BY thread_id DESC LIMIT 1
  `;
  const params = { uid: userId, title };
  const r = await database.query(sql, params);
  return r[0];
}

async function getThreadWithOwner({ threadId }) {
  const sql = `
    SELECT t.thread_id, t.title, t.body, t.views_count, t.comments_count, t.likes_count,
           t.created_at, t.updated_at,
           u.user_id AS owner_id, u.display_name AS owner_name, u.profile_image
    FROM threads t
    JOIN users u ON u.user_id = t.owner_id
    WHERE t.thread_id = :tid
  `;
  const r = await database.query(sql, { tid: threadId });
  return r[0]?.[0] || null;
}

async function listRecentThreads(limit = 3) {
  const n = Math.max(1, Math.min(20, Number(limit) || 3));
  const sql = `
    SELECT t.thread_id, t.title, t.body, t.created_at,
           t.comments_count, t.likes_count,
           u.display_name AS owner_name
    FROM threads t
    JOIN users u ON u.user_id = t.owner_id
    ORDER BY t.created_at DESC
    LIMIT ${n}
  `;
  const r = await database.query(sql, {});
  return r[0] || [];
}

module.exports = {
  createThread,
  getThreadId,
  getThreadWithOwner,
  listRecentThreads
};
