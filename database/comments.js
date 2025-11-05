const db = require('../databaseConnection');

async function addComment({ threadId, authorId, body, parentCommentId }) {
    await db.query(
        `INSERT INTO comments (thread_id, author_id, parent_comment_id, body)
     VALUES (?, ?, ?, ?)`,
        [threadId, authorId, parentCommentId ?? null, body]
    );

    await db.query(
        `UPDATE threads SET comments_count = comments_count + 1 WHERE thread_id = ?`,
        [threadId]
    );
}

async function parentExistsInThread({ threadId, parentCommentId }) {
    const [rows] = await db.query(
        `SELECT 1
       FROM comments
      WHERE comment_id = ? AND thread_id = ?
      LIMIT 1`,
        [parentCommentId, threadId]
    );
    return rows.length > 0;
}

async function getCommentsTree(threadId) {
    const [rows] = await db.query(
        `SELECT c.comment_id, c.parent_comment_id, c.thread_id, c.body, c.created_at,
            u.user_id, u.display_name, u.profile_image
       FROM comments c
       JOIN users u ON u.user_id = c.author_id
      WHERE c.thread_id = ?
      ORDER BY c.created_at ASC`,
        [threadId]
    );

    // Build a tree in memory
    const byId = new Map();
    rows.forEach(r => {
        byId.set(r.comment_id, {
            id: r.comment_id,
            parentId: r.parent_comment_id,
            threadId: r.thread_id,
            body: r.body,
            createdAt: r.created_at,
            author: { id: r.user_id, name: r.display_name, avatar: r.profile_image },
            children: []
        });
    });

    const roots = [];
    byId.forEach(n => {
        if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId).children.push(n);
        else roots.push(n);
    });
    return roots;
}

async function likeComment({ commentId, userId }) {
    const [res] = await db.query(
        `INSERT IGNORE INTO comment_likes(comment_id, user_id) VALUES(?, ?)`,
        [commentId, userId]
    );
    if (res.affectedRows === 1) {
        await db.query(`UPDATE comments SET likes_count = likes_count + 1 WHERE comment_id = ?`, [commentId]);
        return { changed: true };
    }
    return { changed: false };
}

async function unlikeComment({ commentId, userId }) {
    const [res] = await db.query(
        `DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?`,
        [commentId, userId]
    );
    if (res.affectedRows === 1) {
        await db.query(`UPDATE comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE comment_id = ?`, [commentId]);
        return { changed: true };
    }
    return { changed: false };
}

async function isCommentLikedByUser({ commentId, userId }) {
    const [rows] = await db.query(
        `SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ? LIMIT 1`,
        [commentId, userId]
    );
    return rows.length === 1;
}

async function getLikesCount({ commentId }) {
    const [rows] = await db.query(
        `SELECT likes_count FROM comments WHERE comment_id = ?`,
        [commentId]
    );
    return rows?.[0]?.likes_count ?? 0;
}

module.exports = {
    addComment,
    parentExistsInThread,
    getCommentsTree,
    likeComment,
    unlikeComment,
    isCommentLikedByUser,
    getLikesCount,
};