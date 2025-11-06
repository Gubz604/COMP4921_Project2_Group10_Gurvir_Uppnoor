const db = require('../databaseConnection');

async function rebuildSearchDoc({ threadId }) {
  const [[row]] = await db.query(
    `SELECT t.title, t.body, COALESCE(GROUP_CONCAT(c.body SEPARATOR ' '), '') AS csum
   FROM threads t
   LEFT JOIN comments c ON c.thread_id = t.thread_id AND c.is_deleted = 0
   WHERE t.thread_id = ?
   GROUP BY t.thread_id`,
    [threadId]
  );
  const raw = [row.title || '', row.body || '', row.csum || ''].join(' ');
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const padded = ` ${cleaned} `;
  await db.query(
    `INSERT INTO thread_search_docs (thread_id, doc)
   VALUES (?, ?) ON DUPLICATE KEY UPDATE doc = VALUES(doc)`,
    [threadId, padded]
  );
}

// THREADS
async function createThread({ userId, title, description }) {
  const [res] = await db.query(
    `INSERT INTO threads (owner_id, title, body) VALUES (?, ?, ?)`,
    [userId, title, description]
  );
  const threadId = res.insertId;
  await rebuildSearchDoc({ threadId });
  return threadId;
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

// COMMENTS
async function addComment({ threadId, authorId, body, parentCommentId = null }) {
  const sql = `
    INSERT INTO comments (thread_id, author_id, parent_comment_id, body)
    VALUES (?, ?, ?, ?)
  `;
  await db.query(sql, [threadId, authorId, parentCommentId, body]);
  await db.query(`UPDATE threads SET comments_count = comments_count + 1 WHERE thread_id = ?`, [threadId]);
  await rebuildSearchDoc({ threadId });
}

async function likeThread({ threadId, userId }) {
  const sql = `INSERT IGNORE INTO thread_likes(thread_id, user_id) VALUES(?, ?)`;
  const [res] = await db.query(sql, [threadId, userId]);
  if (res.affectedRows === 1) {
    await db.query(`UPDATE threads SET likes_count = likes_count + 1 WHERE thread_id = ?`, [threadId]);
    return { changed: true };
  }
  return { changed: false }; // already liked
}

async function unlikeThread({ threadId, userId }) {
  const [res] = await db.query(`DELETE FROM thread_likes WHERE thread_id = ? AND user_id = ?`, [threadId, userId]);
  if (res.affectedRows === 1) {
    await db.query(`UPDATE threads SET likes_count = GREATEST(likes_count - 1, 0) WHERE thread_id = ?`, [threadId]);
    return { changed: true };
  }
  return { changed: false };
}

async function isThreadLikedByUser({ threadId, userId }) {
  const [rows] = await db.query(`SELECT 1 FROM thread_likes WHERE thread_id = ? AND user_id = ? LIMIT 1`, [threadId, userId]);
  return rows.length === 1;
}

async function getThreadWithOwner({ threadId, userId = null }) {
  const sql = `
    SELECT t.thread_id, t.title, t.body, t.views_count, t.comments_count, t.likes_count,
           t.created_at, t.updated_at,
           u.user_id AS owner_id, u.display_name AS owner_name, u.profile_image,
           EXISTS(
             SELECT 1 FROM thread_likes tl
             WHERE tl.thread_id = t.thread_id AND tl.user_id = ?
           ) AS liked_by_me
    FROM threads t
    JOIN users u ON u.user_id = t.owner_id
    WHERE t.thread_id = ?
  `;
  const [rows] = await db.query(sql, [userId, threadId]);
  return rows?.[0] || null;
}

async function listCommentsForThread({ threadId, userId = null }) {
  const sql = `
    SELECT
      c.comment_id, c.thread_id, c.author_id, c.parent_comment_id,
      c.body,
      c.likes_count, c.is_deleted, c.deleted_at,
      c.created_at,
      -- masked projections for convenience
      CASE WHEN c.is_deleted=1 THEN '[deleted]' ELSE c.body END AS body_masked,
      CASE WHEN c.is_deleted=1 THEN 'deleted'    ELSE u.display_name END AS author_name,
      u.profile_image,
      EXISTS(
        SELECT 1 FROM comment_likes cl
         WHERE cl.comment_id = c.comment_id AND cl.user_id = ?
      ) AS liked_by_me
    FROM comments c
    JOIN users u ON u.user_id = c.author_id
    WHERE c.thread_id = ?
    ORDER BY c.created_at ASC
  `;
  const [rows] = await db.query(sql, [userId, threadId]);
  return rows || [];
}


// + add
async function incrementViews({ threadId }) {
  await db.query(`UPDATE threads SET views_count = views_count + 1 WHERE thread_id = ?`, [threadId]);
}

// modify: include views_count
async function listRecentThreads(limit = 3) {
  const n = Math.max(1, Math.min(20, Number(limit) || 3));
  const sql = `
    SELECT t.thread_id, t.title, t.body,
           t.created_at,
           t.views_count,
           t.comments_count, t.likes_count,
           u.display_name AS owner_name,
           u.profile_image AS owner_profile_image      -- <---
    FROM threads t
    JOIN users u ON u.user_id = t.owner_id
    ORDER BY t.created_at DESC
    LIMIT ${n}
  `;
  const [rows] = await db.query(sql);
  return rows || [];
}

async function listPopularThreads(limit = 3) {
  const n = Math.max(1, Math.min(20, Number(limit) || 3));
  const sql = `
    SELECT t.thread_id, t.title, t.body,
           t.created_at,
           t.views_count,
           t.comments_count, t.likes_count,
           (t.likes_count + t.comments_count) AS popularity,
           u.display_name AS owner_name,
           u.profile_image AS owner_profile_image
    FROM threads t
    JOIN users u ON u.user_id = t.owner_id
    ORDER BY popularity DESC, t.created_at DESC
    LIMIT ${n}
  `;
  const [rows] = await db.query(sql);
  return rows || [];
}
module.exports.listPopularThreads = listPopularThreads;


async function getThreadOwnerByCommentId({ commentId }) {
  const sql = `
    SELECT t.owner_id, c.thread_id
    FROM comments c
    JOIN threads t ON t.thread_id = c.thread_id
    WHERE c.comment_id = ?
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [commentId]);
  return rows?.[0] || null;
}

async function fulltextCandidates({ q, limit = 200 }) {
  const [rows] = await db.query(
    `
    SELECT
      t.thread_id,
      t.title,
      t.body,
      t.created_at,
      t.views_count,
      t.comments_count,
      t.likes_count,
      u.display_name AS owner_name,                  -- <---
      u.profile_image AS owner_profile_image,        -- <---
      MATCH(d.doc) AGAINST (? IN NATURAL LANGUAGE MODE) AS ft_score
    FROM thread_search_docs d
    JOIN threads t ON t.thread_id = d.thread_id
    JOIN users u   ON u.user_id = t.owner_id
    WHERE MATCH(d.doc) AGAINST (? IN NATURAL LANGUAGE MODE)
    ORDER BY ft_score DESC
    LIMIT ?
    `,
    [q, q, Math.max(1, Math.min(500, limit))]
  );
  return rows || [];
}

async function listAllThreadIds() {
  const [rows] = await db.query(`SELECT thread_id FROM threads`);
  return rows.map(r => r.thread_id);
}

async function listThreadsByOwner({ userId }) {
  const [rows] = await db.query(
    `
    SELECT
      t.thread_id,
      t.title,
      t.comments_count,
      t.likes_count,
      t.created_at,
      t.updated_at,
      -- last activity = latest of thread update or any comment update/create
      GREATEST(
        COALESCE(t.updated_at, t.created_at),
        COALESCE((
          SELECT MAX(GREATEST(COALESCE(c.updated_at, c.created_at), c.created_at))
          FROM comments c
          WHERE c.thread_id = t.thread_id
        ), t.created_at)
      ) AS last_activity
    FROM threads t
    WHERE t.owner_id = ?
    ORDER BY last_activity DESC
    `,
    [userId]
  );
  return rows || [];
}

module.exports = {
  createThread,
  getThreadId,
  getThreadWithOwner,
  listRecentThreads,
  addComment,
  listCommentsForThread,
  likeThread,
  unlikeThread,
  isThreadLikedByUser,
  incrementViews,
  getThreadOwnerByCommentId,
  rebuildSearchDoc,
  fulltextCandidates,
  listPopularThreads,
  listThreadsByOwner,
  listAllThreadIds
};


