"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// The browser's speech recognition is not in TypeScript's DOM types, so the
// small part used here is described by hand.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

const noSubscription = () => () => {};

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(onText: (text: string) => void) {
  const supported = useSyncExternalStore(
    noSubscription,
    () => getCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const handler = useRef(onText);

  useEffect(() => {
    handler.current = onText;
  }, [onText]);

  useEffect(() => () => recognition.current?.abort(), []);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    recognition.current?.abort();
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript;
      }
      if (text.trim()) handler.current(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  return { supported, listening, start, stop };
}
