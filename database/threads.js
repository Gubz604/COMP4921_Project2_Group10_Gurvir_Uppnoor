const db = require('../databaseConnection');

// THREADS
async function createThread({ userId, title, description }) {
  const sql = `
    INSERT INTO threads (owner_id, title, body)
    VALUES (?, ?, ?)
  `;
  const [result] = await db.query(sql, [userId, title, description]);
  return result.insertId; // thread_id
}

async function getThreadId({ userId, title }) {
  const sql = `
    SELECT thread_id
    FROM threads
    WHERE owner_id = ? AND title = ?
    ORDER BY thread_id DESC
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [userId, title]);
  return rows || [];
}

async function getThreadWithOwner({ threadId }) {
  const sql = `
    SELECT t.thread_id, t.title, t.body, t.views_count, t.comments_count, t.likes_count,
           t.created_at, t.updated_at,
           u.user_id AS owner_id, u.display_name AS owner_name, u.profile_image
    FROM threads t
    JOIN users u ON u.user_id = t.owner_id
    WHERE t.thread_id = ?
  `;
  const [rows] = await db.query(sql, [threadId]);
  return rows?.[0] || null;
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
  const [rows] = await db.query(sql);
  return rows || [];
}

// COMMENTS
async function addComment({ threadId, authorId, body, parentCommentId = null }) {
  const sql = `
    INSERT INTO comments (thread_id, author_id, parent_comment_id, body)
    VALUES (?, ?, ?, ?)
  `;
  await db.query(sql, [threadId, authorId, parentCommentId, body]);
  await db.query(`UPDATE threads SET comments_count = comments_count + 1 WHERE thread_id = ?`, [threadId]);
}

async function listCommentsForThread({ threadId }) {
  const sql = `
    SELECT c.comment_id, c.thread_id, c.author_id, c.parent_comment_id, c.body,
           c.likes_count, c.created_at,
           u.display_name AS author_name, u.profile_image
    FROM comments c
    JOIN users u ON u.user_id = c.author_id
    WHERE c.thread_id = ?
    ORDER BY c.created_at ASC
  `;
  const [rows] = await db.query(sql, [threadId]);
  return rows || [];
}

module.exports = {
  createThread,
  getThreadId,
  getThreadWithOwner,
  listRecentThreads,
  addComment,
  listCommentsForThread
};
