import { supabase } from "@/integrations/supabase/client";

interface TelegramResponse {
  ok: boolean;
  result?: any;
  error_code?: number;
  description?: string;
}

export async function telegramAction(action: string, params: Record<string, any> = {}): Promise<TelegramResponse> {
  const { data, error } = await supabase.functions.invoke("telegram-bot", {
    body: { action, ...params },
  });

  if (error) throw new Error(error.message);
  return data as TelegramResponse;
}

export async function sendVideoToChannel(
  chatId: string,
  video: string,
  caption?: string
): Promise<TelegramResponse> {
  return telegramAction("sendVideo", { chat_id: chatId, video, caption });
}

export async function copyMessageToChannel(
  chatId: string,
  fromChatId: string,
  messageId: number,
  caption?: string
): Promise<TelegramResponse> {
  return telegramAction("copyMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    caption,
  });
}

export async function sendMessageToChannel(
  chatId: string,
  text: string
): Promise<TelegramResponse> {
  return telegramAction("sendMessage", { chat_id: chatId, text });
}

export async function getBotInfo(): Promise<TelegramResponse> {
  return telegramAction("getMe");
}

export async function getChatInfo(chatId: string): Promise<TelegramResponse> {
  return telegramAction("getChat", { chat_id: chatId });
}
