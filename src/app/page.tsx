'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';

// ===== Types =====
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

type AppScreen = 'home' | 'recording' | 'processing' | 'result';

// ===== Processing Steps =====
const PROCESSING_STEPS = [
  { label: 'Загрузка аудио на сервер...', progress: 15 },
  { label: 'Транскрибирование разговора...', progress: 45 },
  { label: 'AI-анализ содержания...', progress: 70 },
  { label: 'Формирование PDF-брифа...', progress: 85 },
  { label: 'Отправка в Telegram...', progress: 95 },
];

export default function Home() {
  const { user, haptic, hapticNotification, initData } = useTelegram();
  const recorder = useAudioRecorder();

  const [screen, setScreen] = useState<AppScreen>('home');
  const [processingStep, setProcessingStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString('ru-RU', { hour12: false })}: ${msg}`]);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== Format duration to MM:SS =====
  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ===== Process audio (upload, transcribe, analyze, send PDF) =====
  const processAudio = useCallback(async (audioBlob: Blob, filename?: string) => {
    setScreen('processing');
    setProcessingStep(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, filename || 'recording.webm');
      formData.append('initData', initData);
      if (user) {
        formData.append('userId', String(user.id));
        formData.append('userName', user.first_name + (user.last_name ? ` ${user.last_name}` : ''));
      }

      // Simulate steps with timing
      const stepInterval = setInterval(() => {
        setProcessingStep(prev => {
          if (prev < PROCESSING_STEPS.length - 1) return prev + 1;
          return prev;
        });
      }, 3000);

      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Ошибка обработки');
      }

      const result: AnalysisResult = await response.json();
      setAnalysisResult(result);
      setScreen('result');
      hapticNotification('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(message);
      setScreen('home');
      hapticNotification('error');
    }
  }, [initData, user, hapticNotification]);

  // ===== Handle record button =====
  const handleStartRecording = useCallback(() => {
    addLog('Кнопка "Записать" нажата');
    addLog(`MediaDevices API: ${!!navigator?.mediaDevices ? 'Доступен' : 'НЕДОСТУПЕН'}`);
    haptic('medium');
    setError(null);
    try {
      recorder.startRecording();
      addLog('recorder.startRecording() вызван успешно');
      setScreen('recording');
    } catch (e) {
      addLog(`Ошибка startRecording: ${String(e)}`);
    }
  }, [haptic, recorder, addLog]);

  const handleStopRecording = useCallback(() => {
    haptic('heavy');
    recorder.stopRecording();
  }, [haptic, recorder]);

  // When recording stops and we have audio, process it
  useEffect(() => {
    if (!recorder.isRecording && recorder.audioBlob && screen === 'recording') {
      processAudio(recorder.audioBlob);
    }
  }, [recorder.isRecording, recorder.audioBlob, screen, processAudio]);

  // ===== Handle file upload =====
  const handleFileUpload = useCallback(() => {
    addLog('Кнопка "Загрузить" нажата');
    haptic('light');
    setError(null);
    if (!fileInputRef.current) {
      addLog('Ошибка: fileInputRef.current is null');
      return;
    }
    try {
      fileInputRef.current.click();
      addLog('fileInputRef.current.click() вызван');
    } catch (e) {
      addLog(`Ошибка click(): ${String(e)}`);
    }
  }, [haptic, addLog]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
      'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'video/mp4', 'audio/flac'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|webm|m4a|mp4|flac)$/i)) {
      setError('Неподдерживаемый формат. Используйте MP3, WAV, OGG, M4A или WEBM.');
      hapticNotification('error');
      return;
    }

    addLog(`Выбран файл: ${file.name} (${Math.round(file.size / 1024)} KB)`);

    // 25MB limit (OpenAI Whisper limit)
    if (file.size > 25 * 1024 * 1024) {
      addLog('Ошибка: файл больше 25MB');
      setError('Файл слишком большой. Максимум 25 МБ.');
      hapticNotification('error');
      return;
    }

    addLog('Отправка файла на сервер...');
    processAudio(file, file.name);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processAudio, hapticNotification, addLog]);

  // ===== Handle new recording =====
  const handleNewRecording = useCallback(() => {
    haptic('medium');
    recorder.resetRecording();
    setAnalysisResult(null);
    setError(null);
    setProcessingStep(0);
    setScreen('home');
  }, [haptic, recorder]);

  // ===== Render =====
  return (
    <div className="app-shell">
      {/* ===== Header ===== */}
      <header className="app-header">
        <div className="app-header__icon">🏠</div>
        <h1 className="app-header__title">РиелторБриф</h1>
        <p className="app-header__subtitle">
          AI-анализ разговоров с клиентами за минуту
        </p>
        {user && (
          <div className="app-header__user">
            <span className="app-header__user-dot" />
            {user.first_name}
          </div>
        )}
      </header>

      <main className="main-card">
        {/* ===== Error Toast ===== */}
        {(error || recorder.error) && (
          <div className="error-toast" id="error-toast">
            <span className="error-toast__icon">⚠️</span>
            <span className="error-toast__text">{error || recorder.error}</span>
          </div>
        )}

        {/* ===== Debug Logs ===== */}
        <div style={{
          background: 'rgba(0,0,0,0.8)',
          color: '#0f0',
          padding: '10px',
          borderRadius: '8px',
          margin: '0 0 16px 0',
          fontFamily: 'monospace',
          fontSize: '12px',
          maxHeight: '150px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          textAlign: 'left'
        }}>
          <b>Логи (Debug):</b>
          {logs.length === 0 ? <div style={{opacity:0.5}}>Пока пусто...</div> : null}
          {logs.map((log, i) => <div key={i}>{log}</div>)}
        </div>

        {/* ===== Home Screen ===== */}
        {screen === 'home' && (
          <div className="action-section">
            <button
              id="btn-record"
              className="action-btn action-btn--record"
              onClick={handleStartRecording}
            >
              <div className="action-btn__icon">🎙️</div>
              <div className="action-btn__content">
                <div className="action-btn__title">Записать разговор</div>
                <div className="action-btn__desc">
                  Включите диктофон и запишите беседу с клиентом
                </div>
              </div>
              <span className="action-btn__arrow">›</span>
            </button>

            <button
              id="btn-upload"
              className="action-btn action-btn--upload"
              onClick={handleFileUpload}
            >
              <div className="action-btn__icon">📁</div>
              <div className="action-btn__content">
                <div className="action-btn__title">Загрузить запись</div>
                <div className="action-btn__desc">
                  MP3, WAV, OGG, M4A — до 25 МБ
                </div>
              </div>
              <span className="action-btn__arrow">›</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a,.flac"
              className="file-input"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* ===== Recording Screen ===== */}
        {screen === 'recording' && (
          <div className="recording-panel" id="recording-panel">
            {/* Visualizer bars */}
            <div className="recording-panel__visualizer">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  className={`recording-panel__bar ${recorder.isPaused ? 'recording-panel__bar--paused' : ''}`}
                />
              ))}
            </div>

            {/* Timer */}
            <div className="recording-panel__time">
              {formatDuration(recorder.duration)}
            </div>

            {/* Status */}
            <div className="recording-panel__status">
              <span className={`recording-panel__status-dot ${recorder.isPaused ? 'recording-panel__status-dot--paused' : ''}`} />
              {recorder.isPaused ? 'Пауза' : 'Запись...'}
            </div>

            {/* Controls */}
            <div className="recording-panel__controls">
              <button
                id="btn-cancel-recording"
                className="rec-control-btn rec-control-btn--cancel"
                onClick={() => {
                  haptic('light');
                  recorder.stopRecording();
                  recorder.resetRecording();
                  setScreen('home');
                }}
                title="Отменить"
              >
                ✕
              </button>

              {recorder.isPaused ? (
                <button
                  id="btn-resume-recording"
                  className="rec-control-btn rec-control-btn--resume"
                  onClick={() => {
                    haptic('light');
                    recorder.resumeRecording();
                  }}
                  title="Продолжить"
                >
                  ▶
                </button>
              ) : (
                <button
                  id="btn-pause-recording"
                  className="rec-control-btn rec-control-btn--pause"
                  onClick={() => {
                    haptic('light');
                    recorder.pauseRecording();
                  }}
                  title="Пауза"
                >
                  ❚❚
                </button>
              )}

              <button
                id="btn-stop-recording"
                className="rec-control-btn rec-control-btn--stop"
                onClick={handleStopRecording}
                title="Остановить и отправить"
              >
                ■
              </button>
            </div>
          </div>
        )}

        {/* ===== Processing Screen ===== */}
        {screen === 'processing' && (
          <div className="processing-screen" id="processing-screen">
            <div className="processing-screen__spinner" />
            <h2 className="processing-screen__title">Обработка записи</h2>
            <p className="processing-screen__step">
              {PROCESSING_STEPS[processingStep]?.label}
            </p>
            <div className="processing-screen__progress">
              <div
                className="processing-screen__progress-bar"
                style={{ width: `${PROCESSING_STEPS[processingStep]?.progress || 0}%` }}
              />
            </div>
          </div>
        )}

        {/* ===== Result Screen ===== */}
        {screen === 'result' && analysisResult && (
          <div className="result-screen" id="result-screen">
            {/* Success banner */}
            <div className="success-banner">
              <div className="success-banner__icon">✓</div>
              <div className="success-banner__text">
                PDF-бриф отправлен в чат
                <span>Проверьте сообщения от бота</span>
              </div>
            </div>

            {/* Results preview */}
            <div className="result-card">
              <div className="result-card__header">
                <span className="result-card__icon">📋</span>
                <h3 className="result-card__title">Результаты анализа</h3>
              </div>

              <div className="result-item">
                <div className="result-item__label">💰 Бюджет</div>
                <div className="result-item__value">{analysisResult.budget}</div>
              </div>

              <div className="result-item">
                <div className="result-item__label">📍 Желаемые районы</div>
                <div className="result-item__value">{analysisResult.districts}</div>
              </div>

              <div className="result-item">
                <div className="result-item__label">🏢 Тип недвижимости</div>
                <div className="result-item__value">{analysisResult.propertyType}</div>
              </div>

              <div className="result-item">
                <div className="result-item__label">👨‍👩‍👧‍👦 Состав семьи</div>
                <div className="result-item__value">{analysisResult.familyComposition}</div>
              </div>

              <div className="result-item">
                <div className="result-item__label">📅 Сроки сделки</div>
                <div className="result-item__value">{analysisResult.dealTimeline}</div>
              </div>

              <div className="result-item">
                <div className="result-item__label">🏦 Источник финансирования</div>
                <div className="result-item__value">{analysisResult.financingSource}</div>
              </div>

              <div className="result-item">
                <div className="result-item__label">💭 Страхи и пожелания</div>
                <div className="result-item__value">{analysisResult.fearsAndWishes}</div>
              </div>
            </div>

            <button
              id="btn-new-recording"
              className="new-recording-btn"
              onClick={handleNewRecording}
            >
              Новая запись
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
