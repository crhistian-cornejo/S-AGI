-- Register which model was used for each assistant message.
-- Enables cost/token calculation per message without relying on the currently
-- selected model, and shows model in actions for each generated response.

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS model_id TEXT;

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS model_name TEXT;

COMMENT ON COLUMN chat_messages.model_id IS 'AI model id used for this message (e.g. gpt-5.2-openai, GLM-4.7). Null for user/system/tool messages or legacy rows.';
COMMENT ON COLUMN chat_messages.model_name IS 'Display name of the model (e.g. GPT-5.2, GLM-4.7). Used in UI and actions.';

-- Index for analytics: aggregate costs or usage by model
CREATE INDEX IF NOT EXISTS idx_chat_messages_model_id 
ON chat_messages (model_id) 
WHERE model_id IS NOT NULL;
