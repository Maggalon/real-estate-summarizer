/**
 * PDF Generator for Real Estate Client Brief
 * 
 * Generates a professional PDF with Cyrillic text support using pdf-lib
 * with embedded Roboto font from Google Fonts.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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

// Cache the font to avoid re-downloading
const FONT_CACHE_DIR = join(process.cwd(), '.font-cache');
const FONT_REGULAR_PATH = join(FONT_CACHE_DIR, 'Roboto-Regular.ttf');
const FONT_BOLD_PATH = join(FONT_CACHE_DIR, 'Roboto-Bold.ttf');

async function downloadFont(url: string, path: string): Promise<void> {
  if (existsSync(path)) return;

  if (!existsSync(FONT_CACHE_DIR)) {
    mkdirSync(FONT_CACHE_DIR, { recursive: true });
  }

  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(path, buffer);
}

async function loadFonts(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  // Download Roboto fonts from GitHub (Google Fonts mirror)
  await downloadFont(
    'https://github.com/google/fonts/raw/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf',
    FONT_REGULAR_PATH
  );

  // For bold, we'll use the same variable font
  // If variable font fails, we use same file for both
  const regularBytes = readFileSync(FONT_REGULAR_PATH);

  return {
    regular: new Uint8Array(regularBytes),
    bold: new Uint8Array(regularBytes),
  };
}

/**
 * Generate a comprehensive PDF brief.
 */
export async function generateBriefPDF(
  analysis: AnalysisResult,
  agentName: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  let fontRegular;
  let fontBold;

  try {
    const fonts = await loadFonts();
    fontRegular = await pdfDoc.embedFont(fonts.regular);
    fontBold = await pdfDoc.embedFont(fonts.bold);
  } catch (e) {
    console.warn('[PDF] Failed to load Roboto font, falling back to Helvetica:', e);
    fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  const PAGE_WIDTH = 595.28; // A4
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 50;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Colors
  const blue = rgb(0.204, 0.471, 0.965);     // #3478F6
  const darkText = rgb(0.15, 0.15, 0.15);
  const grayText = rgb(0.45, 0.45, 0.45);
  const lightGray = rgb(0.92, 0.94, 0.96);
  const white = rgb(1, 1, 1);

  // ===== Helper: check page break =====
  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 30) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  // ===== Helper: wrap text into lines =====
  const wrapText = (text: string, font: typeof fontRegular, fontSize: number, maxWidth: number): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      try {
        const width = font.widthOfTextAtSize(testLine, fontSize);
        if (width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      } catch {
        // If character not supported, skip
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length ? lines : [''];
  };

  // ===== Header Block =====
  // Blue banner
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 100,
    width: PAGE_WIDTH,
    height: 100,
    color: blue,
  });

  // Title
  page.drawText('БРИФ КЛИЕНТА', {
    x: MARGIN,
    y: PAGE_HEIGHT - 45,
    size: 24,
    font: fontBold,
    color: white,
  });

  // Subtitle
  page.drawText('Анализ разговора с помощью AI', {
    x: MARGIN,
    y: PAGE_HEIGHT - 65,
    size: 11,
    font: fontRegular,
    color: rgb(0.85, 0.9, 1),
  });

  // Date and agent info
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  page.drawText(`Агент: ${agentName}  •  ${dateStr}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 85,
    size: 9,
    font: fontRegular,
    color: rgb(0.75, 0.82, 1),
  });

  y = PAGE_HEIGHT - 120;

  // ===== Section Drawer =====
  const addSection = (icon: string, title: string, value: string) => {
    const titleText = `${icon}  ${title}`;
    const valueLines = wrapText(value, fontRegular, 10, CONTENT_WIDTH - 20);
    const sectionHeight = 30 + valueLines.length * 15;

    ensureSpace(sectionHeight);

    // Section header background
    page.drawRectangle({
      x: MARGIN,
      y: y - 18,
      width: CONTENT_WIDTH,
      height: 22,
      color: lightGray,
      borderColor: rgb(0.88, 0.9, 0.93),
      borderWidth: 0.5,
    });

    // Section title
    page.drawText(titleText, {
      x: MARGIN + 10,
      y: y - 12,
      size: 11,
      font: fontBold,
      color: blue,
    });

    y -= 28;

    // Section value
    for (const line of valueLines) {
      ensureSpace(16);
      try {
        page.drawText(line, {
          x: MARGIN + 10,
          y: y,
          size: 10,
          font: fontRegular,
          color: darkText,
        });
      } catch {
        // fallback for unsupported chars
        page.drawText(line.replace(/[^\x00-\x7F]/g, '?'), {
          x: MARGIN + 10,
          y: y,
          size: 10,
          font: fontRegular,
          color: darkText,
        });
      }
      y -= 15;
    }

    y -= 8;
  };

  // ===== Brief Sections =====
  addSection('💰', 'БЮДЖЕТ', analysis.budget);
  addSection('📍', 'ЖЕЛАЕМЫЕ РАЙОНЫ', analysis.districts);
  addSection('🏢', 'ТИП НЕДВИЖИМОСТИ', analysis.propertyType);
  addSection('👨‍👩‍👧‍👦', 'СОСТАВ СЕМЬИ', analysis.familyComposition);
  addSection('📅', 'СРОКИ СДЕЛКИ', analysis.dealTimeline);
  addSection('🏦', 'ИСТОЧНИК ФИНАНСИРОВАНИЯ', analysis.financingSource);
  addSection('💭', 'СТРАХИ И ПОЖЕЛАНИЯ', analysis.fearsAndWishes);

  // ===== Divider =====
  ensureSpace(30);
  page.drawLine({
    start: { x: MARGIN, y: y },
    end: { x: PAGE_WIDTH - MARGIN, y: y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 20;

  // ===== Transcription =====
  ensureSpace(40);
  page.drawRectangle({
    x: MARGIN,
    y: y - 18,
    width: CONTENT_WIDTH,
    height: 22,
    color: lightGray,
  });
  page.drawText('📝  ТРАНСКРИПЦИЯ РАЗГОВОРА', {
    x: MARGIN + 10,
    y: y - 12,
    size: 11,
    font: fontBold,
    color: blue,
  });
  y -= 30;

  // Truncate transcription
  const maxChars = 4000;
  const transcriptionText = analysis.rawTranscription.length > maxChars
    ? analysis.rawTranscription.slice(0, maxChars) + '... [сокращено]'
    : analysis.rawTranscription;

  const transLines = wrapText(transcriptionText, fontRegular, 8, CONTENT_WIDTH - 20);

  for (const line of transLines) {
    ensureSpace(12);
    try {
      page.drawText(line, {
        x: MARGIN + 10,
        y: y,
        size: 8,
        font: fontRegular,
        color: grayText,
      });
    } catch {
      // Skip lines with unsupported chars
    }
    y -= 12;
  }

  // ===== Footer on all pages =====
  const pages = pdfDoc.getPages();
  pages.forEach((p, i) => {
    try {
      p.drawText(`РиелторБриф AI  •  Стр. ${i + 1} из ${pages.length}`, {
        x: MARGIN,
        y: 25,
        size: 7,
        font: fontRegular,
        color: rgb(0.7, 0.7, 0.7),
      });
    } catch {
      // fallback
    }
  });

  // Serialize
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
