import { defaultDatabase } from './database.js';

function createConversation(row) {
  return {
    id: row.id,
    title: row.title,
    messages: row.messages,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function withTransaction(db, operation) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createConversationStore({ db = defaultDatabase } = {}) {
  return {
    async list(userId) {
      const [result, workspace] = await Promise.all([
        db.query(
        `SELECT c.id, c.title, c.messages, c.created_at, c.updated_at,
                w.active_conversation_id
         FROM saved_conversations c
         LEFT JOIN workspace_state w ON w.user_id = c.user_id
         WHERE c.user_id = $1
         ORDER BY c.updated_at DESC, c.id`,
          [userId]
        ),
        db.query(
          'SELECT active_conversation_id FROM workspace_state WHERE user_id = $1',
          [userId]
        )
      ]);
      return {
        conversations: result.rows.map(createConversation),
        activeConversationId: workspace.rows[0]?.active_conversation_id || null
      };
    },

    async save(userId, conversation, activeConversationId) {
      return withTransaction(db, async client => {
        await client.query(
          `INSERT INTO saved_conversations
             (user_id, id, title, messages, created_at, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, NOW()), NOW())
           ON CONFLICT (user_id, id) DO UPDATE SET
             title = EXCLUDED.title,
             messages = EXCLUDED.messages,
             updated_at = NOW()`,
          [
            userId,
            conversation.id,
            conversation.title,
            JSON.stringify(conversation.messages),
            conversation.createdAt || null
          ]
        );
        if (activeConversationId !== undefined) {
          if (activeConversationId !== null && activeConversationId !== conversation.id) {
            const error = new Error(
              'A conversation can only activate itself when it is saved.'
            );
            error.code = 'INVALID_ACTIVE_CONVERSATION';
            throw error;
          }
          await client.query(
            `INSERT INTO workspace_state (user_id, active_conversation_id, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               active_conversation_id = EXCLUDED.active_conversation_id,
               updated_at = NOW()`,
            [userId, activeConversationId]
          );
        }
      });
    },

    async setActive(userId, conversationId) {
      if (conversationId !== null) {
        const found = await db.query(
          'SELECT 1 FROM saved_conversations WHERE user_id = $1 AND id = $2',
          [userId, conversationId]
        );
        if (!found.rowCount) {
          const error = new Error('The active conversation does not belong to this account.');
          error.code = 'CONVERSATION_NOT_FOUND';
          throw error;
        }
      }

      await db.query(
        `INSERT INTO workspace_state (user_id, active_conversation_id, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           active_conversation_id = EXCLUDED.active_conversation_id,
           updated_at = NOW()`,
        [userId, conversationId]
      );
    },

    async delete(userId, conversationId) {
      return withTransaction(db, async client => {
        const result = await client.query(
          'DELETE FROM saved_conversations WHERE user_id = $1 AND id = $2',
          [userId, conversationId]
        );
        await client.query(
          `UPDATE workspace_state SET active_conversation_id = NULL, updated_at = NOW()
           WHERE user_id = $1 AND active_conversation_id = $2`,
          [userId, conversationId]
        );
        return result.rowCount > 0;
      });
    },

    async clear(userId) {
      return withTransaction(db, async client => {
        const result = await client.query(
          'DELETE FROM saved_conversations WHERE user_id = $1',
          [userId]
        );
        await client.query(
          `INSERT INTO workspace_state (user_id, active_conversation_id, updated_at)
           VALUES ($1, NULL, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             active_conversation_id = NULL,
             updated_at = NOW()`,
          [userId]
        );
        return result.rowCount;
      });
    },

    async import(userId, conversations, activeConversationId) {
      return withTransaction(db, async client => {
        let importedCount = 0;
        for (const conversation of conversations) {
          const result = await client.query(
            `INSERT INTO saved_conversations
               (user_id, id, title, messages, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, NOW()), NOW())
             ON CONFLICT (user_id, id) DO NOTHING`,
            [
              userId,
              conversation.id,
              conversation.title,
              JSON.stringify(conversation.messages),
              conversation.createdAt || null
            ]
          );
          importedCount += result.rowCount;
        }

        const activeId = activeConversationId === null
          ? null
          : conversations.some(chat => chat.id === activeConversationId)
            ? activeConversationId
            : null;
        if (activeId) {
          const result = await client.query(
            'SELECT 1 FROM saved_conversations WHERE user_id = $1 AND id = $2',
            [userId, activeId]
          );
          if (!result.rowCount) {
            throw new Error('Imported active conversation was not found.');
          }
        }
        await client.query(
          `INSERT INTO workspace_state (user_id, active_conversation_id, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             active_conversation_id = EXCLUDED.active_conversation_id,
             updated_at = NOW()`,
          [userId, activeId]
        );
        return { importedCount };
      });
    }
  };
}
