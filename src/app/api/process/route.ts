import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { generateBriefPDF } from '@/lib/pdf-generator';
import { sendPDFToUser } from '@/lib/telegram-bot';

export const maxDuration = 60; // Allow up to 60s for processing

export interface AnalysisResult {
  // 1. Паспорт контакта
  contactDateTime: string;
  interactionType: string;
  clientName: string;
  clientRole: string;
  // 2. Квалификация и профиль клиента
  motivation: string;
  budget: string;
  paymentMethod: string;
  timeline: string;
  decisionMakers: string;
  priorExperience: string;
  // 3. Детали по объекту недвижимости
  propertyAddress: string;
  legalStatus: string;
  feedback: string;
  // 4. Ход переговоров
  providedInfo: string;
  priceJustification: string;
  clientProgress: string;
  // 5. Возражения и "красные флаги"
  objections: string;
  trueReason: string;
  objectionHandling: string;
  // 6. Action Plan
  agreements: string;
  agentTasks: string;
  nextContact: string;
  // Транскрипция
  rawTranscription: string;
}

const ANALYSIS_PROMPT = `Ты — профессиональный AI-помощник для риелторов. Прослушай аудиозапись разговора между риелтором и клиентом.

Выполни ДВЕ задачи:

1. ТРАНСКРИПЦИЯ: Создай полную текстовую транскрипцию разговора на русском языке.

2. АНАЛИЗ: Извлеки из разговора структурированную информацию по 6 блокам:

БЛОК 1: Паспорт контакта (Метаданные)
- contactDateTime: Дата и время контакта (из разговора, иначе "Не указано").
- interactionType: Тип взаимодействия (Входящий звонок / Исходящий звонок / Личная встреча / Показ объекта / Переговоры по сделке).
- clientName: ФИО клиента.
- clientRole: Роль клиента (Покупатель / Продавец / Встречная покупка).

БЛОК 2: Квалификация и профиль клиента (Что мы узнали)
- motivation: Потребность / Мотивация (истинная причина продажи/покупки, зачем продают, для кого покупают).
- budget: Бюджет / Ожидания по цене (сумма покупки или "дно" для продавца).
- paymentMethod: Форма расчетов (наличные, ипотека, маткапитал, субсидии).
- timeline: Сроки (как быстро нужно переехать или выйти на сделку).
- decisionMakers: ЛПР - Лица, принимающие решение (кто еще участвует в сделке).
- priorExperience: Опыт работы (был ли негативный/позитивный опыт с другими агентствами).

БЛОК 3: Детали по объекту недвижимости
- propertyAddress: Адрес и базовые параметры.
- legalStatus: Юридический статус (обременения, собственники, маткапитал, готовность документов).
- feedback: Обратная связь после показа (что понравилось, что категорически нет).

БЛОК 4: Ход переговоров (Что транслировал риелтор)
- providedInfo: Предоставленная информация (маркетинговый план, аналитика, эксклюзив и т.д.).
- priceJustification: Обоснование комиссии/цены (аргументы про безопасность, экономию времени).
- clientProgress: Прогресс по клиенту (например: "Контакт установлен", "Согласие получено").

БЛОК 5: Возражения и "красные флаги"
- objections: Озвученные возражения ("Дорого", "Я подумаю", "Сам продам").
- trueReason: Истинная причина / Диагностика ИИ (скрытый страх клиента: боится обмана, сравнивает цены).
- objectionHandling: Отработка (как риелтор закрыл возражение).

БЛОК 6: Action Plan (Резолюция и следующие шаги)
- agreements: Договоренности (встреча на объекте и т.д.).
- agentTasks: Задачи для риелтора (что конкретно сделать).
- nextContact: Следующий контакт (дата и время).

Правила:
- Если информация не была упомянута, напиши "Не указано".
- Используй конкретные цифры и факты из разговора.
- Анализ должен быть точным и лаконичным, без "воды".
- Транскрипция должна быть полной и дословной.`;

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
            transcription: { type: Type.STRING, description: 'Транскрипция' },
            contactDateTime: { type: Type.STRING },
            interactionType: { type: Type.STRING },
            clientName: { type: Type.STRING },
            clientRole: { type: Type.STRING },
            motivation: { type: Type.STRING },
            budget: { type: Type.STRING },
            paymentMethod: { type: Type.STRING },
            timeline: { type: Type.STRING },
            decisionMakers: { type: Type.STRING },
            priorExperience: { type: Type.STRING },
            propertyAddress: { type: Type.STRING },
            legalStatus: { type: Type.STRING },
            feedback: { type: Type.STRING },
            providedInfo: { type: Type.STRING },
            priceJustification: { type: Type.STRING },
            clientProgress: { type: Type.STRING },
            objections: { type: Type.STRING },
            trueReason: { type: Type.STRING },
            objectionHandling: { type: Type.STRING },
            agreements: { type: Type.STRING },
            agentTasks: { type: Type.STRING },
            nextContact: { type: Type.STRING },
          },
          required: [
            'transcription', 'contactDateTime', 'interactionType', 'clientName', 'clientRole',
            'motivation', 'budget', 'paymentMethod', 'timeline', 'decisionMakers', 'priorExperience',
            'propertyAddress', 'legalStatus', 'feedback',
            'providedInfo', 'priceJustification', 'clientProgress',
            'objections', 'trueReason', 'objectionHandling',
            'agreements', 'agentTasks', 'nextContact'
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
      contactDateTime: parsed.contactDateTime || 'Не указано',
      interactionType: parsed.interactionType || 'Не указано',
      clientName: parsed.clientName || 'Не указано',
      clientRole: parsed.clientRole || 'Не указано',
      motivation: parsed.motivation || 'Не указано',
      budget: parsed.budget || 'Не указано',
      paymentMethod: parsed.paymentMethod || 'Не указано',
      timeline: parsed.timeline || 'Не указано',
      decisionMakers: parsed.decisionMakers || 'Не указано',
      priorExperience: parsed.priorExperience || 'Не указано',
      propertyAddress: parsed.propertyAddress || 'Не указано',
      legalStatus: parsed.legalStatus || 'Не указано',
      feedback: parsed.feedback || 'Не указано',
      providedInfo: parsed.providedInfo || 'Не указано',
      priceJustification: parsed.priceJustification || 'Не указано',
      clientProgress: parsed.clientProgress || 'Не указано',
      objections: parsed.objections || 'Не указано',
      trueReason: parsed.trueReason || 'Не указано',
      objectionHandling: parsed.objectionHandling || 'Не указано',
      agreements: parsed.agreements || 'Не указано',
      agentTasks: parsed.agentTasks || 'Не указано',
      nextContact: parsed.nextContact || 'Не указано',
      rawTranscription: parsed.transcription || 'Транскрипция недоступна',
    };

    console.log(`[Process] Analysis complete`);

    // ===== Step 3: Generate PDF =====
    console.log(`[Process] Generating PDF...`);
    const pdfBuffer = await generateBriefPDF(analysis, userName || 'Агент');

    // ===== Step 4: Send PDF via Telegram Bot =====
    console.log(`[Process] Sending PDF to user ${userId}...`);
    await sendPDFToUser(Number(userId), pdfBuffer, userName || 'Агент', {
      name: analysis.clientName,
      role: analysis.clientRole,
      budget: analysis.budget,
      motivation: analysis.motivation,
    });

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
