import { supabase } from "./client";
import { Tables, TablesInsert, TablesUpdate } from "@/shared/types";
import { Errors } from "../errors";

// ==================== Type Helpers ====================
type Chat = Tables<"chats">;
type Message = Tables<"messages">;
type Artifact = Tables<"artifacts">;
type QuickPrompt = Tables<"quick_prompts">;
type Attachment = Tables<"attachments">;

// ==================== Chat Queries ====================
export const chatQueries = {
  getAll: async (userId: string) => {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throw Errors.DatabaseError("fetching chats", error.message);
    return data;
  },

  getById: async (id: string) => {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw Errors.ChatNotFound(id);
    return data;
  },

  create: async (chat: TablesInsert<"chats">) => {
    const { data, error } = await supabase
      .from("chats")
      .insert(chat)
      .select()
      .single();

    if (error) throw Errors.ChatCreationFailed(error.message);
    return data;
  },

  update: async (id: string, updates: TablesUpdate<"chats">) => {
    const { data, error } = await supabase
      .from("chats")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw Errors.DatabaseError("updating chat", error.message);
    return data;
  },

  delete: async (id: string) => {
    const { error } = await supabase.from("chats").delete().eq("id", id);

    if (error) throw Errors.DatabaseError("deleting chat", error.message);
  },
};

// ==================== Message Queries ====================
export const messageQueries = {
  getByChatId: async (chatId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) throw Errors.DatabaseError("fetching messages", error.message);
    return data;
  },

  create: async (message: TablesInsert<"messages">) => {
    const { data, error } = await supabase
      .from("messages")
      .insert(message)
      .select()
      .single();

    if (error) throw Errors.DatabaseError("creating message", error.message);
    return data;
  },

  update: async (id: string, updates: TablesUpdate<"messages">) => {
    const { data, error } = await supabase
      .from("messages")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw Errors.DatabaseError("updating message", error.message);
    return data;
  },
};

// ==================== Artifact Queries ====================
export const artifactQueries = {
  getByChatId: async (chatId: string) => {
    const { data, error } = await supabase
      .from("artifacts")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false });

    if (error) throw Errors.DatabaseError("fetching artifacts", error.message);
    return data;
  },

  getById: async (id: string) => {
    const { data, error } = await supabase
      .from("artifacts")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw Errors.ArtifactNotFound(id);
    return data;
  },

  create: async (artifact: TablesInsert<"artifacts">) => {
    const { data, error } = await supabase
      .from("artifacts")
      .insert(artifact)
      .select()
      .single();

    if (error) throw Errors.ArtifactGenerationFailed("database", error.message);
    return data;
  },

  update: async (id: string, updates: TablesUpdate<"artifacts">) => {
    const { data, error } = await supabase
      .from("artifacts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw Errors.DatabaseError("updating artifact", error.message);
    return data;
  },

  delete: async (id: string) => {
    const { error } = await supabase.from("artifacts").delete().eq("id", id);

    if (error) throw Errors.DatabaseError("deleting artifact", error.message);
  },
};

// ==================== Quick Prompt Queries ====================
export const quickPromptQueries = {
  getAll: async (userId: string) => {
    const { data, error } = await supabase
      .from("quick_prompts")
      .select("*")
      .eq("user_id", userId)
      .order("order", { ascending: true });

    if (error) throw Errors.DatabaseError("fetching quick prompts", error.message);
    return data;
  },

  create: async (prompt: TablesInsert<"quick_prompts">) => {
    const { data, error } = await supabase
      .from("quick_prompts")
      .insert(prompt)
      .select()
      .single();

    if (error) throw Errors.DatabaseError("creating quick prompt", error.message);
    return data;
  },

  update: async (id: string, updates: TablesUpdate<"quick_prompts">) => {
    const { data, error } = await supabase
      .from("quick_prompts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw Errors.DatabaseError("updating quick prompt", error.message);
    return data;
  },

  delete: async (id: string) => {
    const { error } = await supabase.from("quick_prompts").delete().eq("id", id);

    if (error) throw Errors.DatabaseError("deleting quick prompt", error.message);
  },
};

// ==================== Attachment Queries ====================
export const attachmentQueries = {
  getByMessageId: async (messageId: string) => {
    const { data, error } = await supabase
      .from("attachments")
      .select("*")
      .eq("message_id", messageId);

    if (error) throw Errors.DatabaseError("fetching attachments", error.message);
    return data;
  },

  create: async (attachment: TablesInsert<"attachments">) => {
    const { data, error } = await supabase
      .from("attachments")
      .insert(attachment)
      .select()
      .single();

    if (error) throw Errors.DatabaseError("creating attachment", error.message);
    return data;
  },

  delete: async (id: string) => {
    const { error } = await supabase.from("attachments").delete().eq("id", id);

    if (error) throw Errors.DatabaseError("deleting attachment", error.message);
  },
};

// ==================== Export ====================
export const queries = {
  chat: chatQueries,
  message: messageQueries,
  artifact: artifactQueries,
  quickPrompt: quickPromptQueries,
  attachment: attachmentQueries,
};
