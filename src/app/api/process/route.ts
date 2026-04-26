import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { generateBriefPDF } from '@/lib/pdf-generator';
import { sendPDFToUser } from '@/lib/telegram-bot';

export const maxDuration = 60; // Allow up to 60s for processing

interface AnalysisResult {
  budget: string;
  districts: string;
  propertyType: string;
  familyComposition: string;
  dealTimeline: string;
  financingSource: string;
  fearsAndWishes: string;
  rawTranscription: string;
}

const ANALYSIS_PROMPT = `Ты — профессиональный AI-помощник для риелторов. Прослушай аудиозапись разговора между риелтором и клиентом.

Выполни ДВЕ задачи:

1. ТРАНСКРИПЦИЯ: Создай полную текстовую транскрипцию разговора на русском языке.

2. АНАЛИЗ: Извлеки из разговора следующую структурированную информацию:
   - budget: Бюджет клиента на покупку/аренду недвижимости. Если диапазон — укажи от и до.
   - districts: Желаемые районы/локации. Перечисли все упоминаемые районы, улицы, ориентиры.
   - propertyType: Тип недвижимости: квартира/дом/таунхаус и т.д. Количество комнат, желаемая площадь, этаж, другие характеристики.
   - familyComposition: Состав семьи: количество людей, наличие детей (возраст), домашних животных.
   - dealTimeline: Желаемые сроки сделки, когда хотят заехать/купить.
   - financingSource: Источник финансирования: ипотека, наличные, материнский капитал, военная ипотека, рассрочка и т.д.
   - fearsAndWishes: Главные страхи, опасения, ключевые пожелания и приоритеты клиента. Запиши подробно все нюансы.

Правила:
- Если информация не была упомянута в разговоре, напиши "Не указан" / "Не указаны" / "Не упоминается"
- Используй конкретные цифры и факты из разговора
- Будь максимально точным
- Транскрипция должна быть полной и дословной`;

export async function POST(request: NextRequest) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const userId = formData.get('userId') as string;
    const userName = formData.get('userName') as string;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Аудиофайл не найден' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'ID пользователя не найден. Откройте приложение через Telegram.' },
        { status: 400 }
      );
    }

    // ===== Step 1: Upload audio to Gemini Files API =====
    console.log(`[Process] Uploading audio for user ${userId}...`);

    // Convert File to a Blob for the Gemini SDK
    const audioArrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);
    const audioBase64 = audioBuffer.toString('base64');

    // Determine MIME type
    const mimeType = audioFile.type || 'audio/webm';

    console.log(`[Process] Audio size: ${audioBuffer.length} bytes, type: ${mimeType}`);

    // ===== Step 2: Transcribe + Analyze with Gemini (single multimodal call) =====
    console.log(`[Process] Transcribing and analyzing with Gemini...`);

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: audioBase64,
              },
            },
            {
              text: ANALYSIS_PROMPT,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: {
              type: Type.STRING,
              description: 'Полная текстовая транскрипция разговора на русском языке.',
            },
            budget: {
              type: Type.STRING,
              description: 'Бюджет клиента.',
            },
            districts: {
              type: Type.STRING,
              description: 'Желаемые районы и локации.',
            },
            propertyType: {
              type: Type.STRING,
              description: 'Тип недвижимости, комнатность, площадь.',
            },
            familyComposition: {
              type: Type.STRING,
              description: 'Состав семьи: дети, животные.',
            },
            dealTimeline: {
              type: Type.STRING,
              description: 'Желаемые сроки сделки.',
            },
            financingSource: {
              type: Type.STRING,
              description: 'Источник финансирования.',
            },
            fearsAndWishes: {
              type: Type.STRING,
              description: 'Главные страхи и пожелания клиента.',
            },
          },
          required: [
            'transcription',
            'budget',
            'districts',
            'propertyType',
            'familyComposition',
            'dealTimeline',
            'financingSource',
            'fearsAndWishes',
          ],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      return NextResponse.json(
        { error: 'Gemini не вернул результат. Попробуйте ещё раз.' },
        { status: 500 }
      );
    }

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      console.error('[Process] Failed to parse Gemini response:', responseText);
      return NextResponse.json(
        { error: 'Ошибка парсинга AI-ответа. Попробуйте ещё раз.' },
        { status: 500 }
      );
    }

    const analysis: AnalysisResult = {
      budget: parsed.budget || 'Не указан',
      districts: parsed.districts || 'Не указаны',
      propertyType: parsed.propertyType || 'Не указан',
      familyComposition: parsed.familyComposition || 'Не указан',
      dealTimeline: parsed.dealTimeline || 'Не указаны',
      financingSource: parsed.financingSource || 'Не указан',
      fearsAndWishes: parsed.fearsAndWishes || 'Не указаны',
      rawTranscription: parsed.transcription || 'Транскрипция недоступна',
    };

    console.log(`[Process] Analysis complete`);

    // ===== Step 3: Generate PDF =====
    console.log(`[Process] Generating PDF...`);
    const pdfBuffer = await generateBriefPDF(analysis, userName || 'Агент');

    // ===== Step 4: Send PDF via Telegram Bot =====
    console.log(`[Process] Sending PDF to user ${userId}...`);
    await sendPDFToUser(Number(userId), pdfBuffer, userName || 'Агент');

    console.log(`[Process] Done!`);

    return NextResponse.json(analysis);
  } catch (err) {
    console.error('[Process] Error:', err);
    const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
