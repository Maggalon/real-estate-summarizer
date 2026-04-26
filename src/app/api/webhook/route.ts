import { NextRequest, NextResponse } from 'next/server';
import { sendMessage, sendMiniAppButton } from '@/lib/telegram-bot';

/**
 * Telegram Bot Webhook Handler
 * 
 * Receives updates from Telegram and handles:
 * - /start — Welcome message with Mini App button
 * - /help — Usage instructions
 * - /brief — Open the Mini App
 */

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
    };
    data: string;
  };
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com';

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();

    // Handle messages
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const firstName = update.message.from.first_name;

      switch (text) {
        case '/start': {
          await sendMessage(
            chatId,
            `👋 Привет, *${firstName}*!\n\n` +
            `Я — *Блокнот риелтора*, ваш AI-помощник для анализа разговоров с клиентами.\n\n` +
            `🎙️ *Как это работает:*\n` +
            `1. Откройте приложение кнопкой ниже\n` +
            `2. Запишите разговор или загрузите аудио\n` +
            `3. Получите PDF-бриф прямо в этот чат\n\n` +
            `Нажмите кнопку ниже, чтобы начать 👇`
          );

          await sendMiniAppButton(
            chatId,
            '🚀 Откройте приложение для записи:',
            '🎙️ Открыть Блокнот риелтора',
            APP_URL
          );
          break;
        }

        case '/help': {
          await sendMessage(
            chatId,
            `ℹ️ *Справка — Блокнот риелтора*\n\n` +
            `*Доступные команды:*\n` +
            `/start — Начать работу\n` +
            `/brief — Открыть приложение\n` +
            `/help — Эта справка\n\n` +
            `*Как пользоваться:*\n` +
            `1. Нажмите /brief или кнопку «Открыть»\n` +
            `2. Выберите: записать или загрузить аудио\n` +
            `3. AI проанализирует разговор\n` +
            `4. PDF-бриф придёт в этот чат\n\n` +
            `*Поддерживаемые форматы:*\n` +
            `MP3, WAV, OGG, WEBM, M4A, FLAC\n` +
            `Максимальный размер: 25 МБ\n\n` +
            `💡 _Для лучшего качества используйте запись в тихом помещении._`
          );
          break;
        }

        case '/brief': {
          await sendMiniAppButton(
            chatId,
            '🎙️ Нажмите кнопку, чтобы открыть приложение:',
            '📋 Открыть Блокнот риелтора',
            APP_URL
          );
          break;
        }

        default: {
          // Handle any other text
          if (text.startsWith('/')) {
            await sendMessage(
              chatId,
              `❓ Неизвестная команда.\n\nИспользуйте /help для списка команд.`
            );
          } else {
            await sendMiniAppButton(
              chatId,
              `👋 Чтобы создать бриф, откройте приложение:`,
              '🎙️ Открыть Блокнот риелтора',
              APP_URL
            );
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Webhook] Error:', err);
    // Always return 200 to Telegram to prevent re-delivery
    return NextResponse.json({ ok: true });
  }
}

// Telegram sends GET to verify webhook
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    bot: 'Блокнот риелтора',
    timestamp: new Date().toISOString(),
  });
}
