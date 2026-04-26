/**
 * Telegram Bot integration for sending PDF documents
 * and handling bot commands.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Send a PDF brief document to a Telegram user.
 */
export async function sendPDFToUser(
  chatId: number,
  pdfBuffer: Buffer,
  agentName: string
): Promise<void> {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const fileName = `brief_${dateStr.replace(/\./g, '-')}_${now.getHours()}-${String(now.getMinutes()).padStart(2, '0')}.pdf`;

  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  formData.append('document', new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }), fileName);
  formData.append('caption', `📋 *Бриф клиента*\n\n🕐 ${dateStr}, ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}\n👤 Агент: ${agentName}\n\n_Сформировано с помощью РиелторБриф AI_`);
  formData.append('parse_mode', 'Markdown');

  const response = await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    console.error('[Telegram] Failed to send document:', errData);
    throw new Error(`Не удалось отправить PDF: ${errData.description || 'Ошибка Telegram API'}`);
  }
}

/**
 * Send a simple text message to a Telegram user.
 */
export async function sendMessage(
  chatId: number,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Promise<void> {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    console.error('[Telegram] Failed to send message:', errData);
  }
}

/**
 * Send a message with Mini App button.
 */
export async function sendMiniAppButton(
  chatId: number,
  text: string,
  buttonText: string,
  webAppUrl: string
): Promise<void> {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: buttonText, web_app: { url: webAppUrl } },
        ]],
      },
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    console.error('[Telegram] Failed to send Mini App button:', errData);
  }
}

/**
 * Set the webhook for the Telegram bot.
 */
export async function setWebhook(webhookUrl: string): Promise<boolean> {
  const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    }),
  });

  const data = await response.json();
  console.log('[Telegram] Webhook set result:', data);
  return data.ok;
}

/**
 * Delete the webhook (for switching to polling).
 */
export async function deleteWebhook(): Promise<boolean> {
  const response = await fetch(`${TELEGRAM_API}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: true }),
  });

  const data = await response.json();
  return data.ok;
}
