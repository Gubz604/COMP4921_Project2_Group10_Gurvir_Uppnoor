const db = require('../databaseConnection');

async function addComment({ threadId, authorId, body, parentCommentId }) {
    // parentCommentId can be null for top-level comments
    await db.query(
        `INSERT INTO comments (thread_id, author_id, parent_comment_id, body)
     VALUES (?, ?, ?, ?)`,
        [threadId, authorId, parentCommentId ?? null, body]
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

module.exports = {
    addComment,
    parentExistsInThread,
    getCommentsTree
};