import { NextRequest, NextResponse } from 'next/server';
import { setWebhook, deleteWebhook } from '@/lib/telegram-bot';

/**
 * Webhook setup endpoint.
 * 
 * POST /api/setup-webhook — Register webhook with Telegram
 * DELETE /api/setup-webhook — Remove webhook
 */

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json().catch(() => ({ url: null }));
    const webhookUrl = url || `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook`;

    const result = await setWebhook(webhookUrl);

    return NextResponse.json({
      ok: result,
      webhookUrl,
      message: result ? 'Webhook установлен' : 'Ошибка установки webhook',
    });
  } catch (err) {
    console.error('[Setup Webhook] Error:', err);
    return NextResponse.json(
      { error: 'Ошибка установки webhook' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const result = await deleteWebhook();
    return NextResponse.json({
      ok: result,
      message: result ? 'Webhook удалён' : 'Ошибка удаления webhook',
    });
  } catch (err) {
    console.error('[Delete Webhook] Error:', err);
    return NextResponse.json(
      { error: 'Ошибка удаления webhook' },
      { status: 500 }
    );
  }
}
