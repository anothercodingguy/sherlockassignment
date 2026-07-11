import { useEffect, useRef, useState } from 'react';
import type { MeetingEvent } from '../../shared/types';
import { LOCAL_USER_ID } from '../constants';

export type MediaStateStatus = 'idle' | 'active' | 'denied';

const event = (payload: Record<string, unknown>): MeetingEvent => ({
  ...payload,
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString()
} as unknown as MeetingEvent);

export function useMediaStream(postEvent: (event: MeetingEvent) => Promise<void>) {
  const [mediaState, setMediaState] = useState<MediaStateStatus>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const audioTimer = useRef<number | undefined>(undefined);

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = undefined;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = undefined;
    }
    if (audioTimer.current) {
      window.clearInterval(audioTimer.current);
      audioTimer.current = undefined;
    }
  };

  useEffect(() => {
    return cleanup;
  }, []);

  const startCamera = async () => {
    cleanup(); // Clean up existing streams/contexts before starting a new one to prevent leaks
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setMediaState('active');
      
      await postEvent(event({ type: 'participant.media_updated', participantId: LOCAL_USER_ID, media: { webcamOn: true, audioOn: true } }));
      
      const context = new AudioContext();
      audioContextRef.current = context;
      
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyzer);
      const data = new Uint8Array(analyzer.frequencyBinCount);
      
      audioTimer.current = window.setInterval(() => {
        analyzer.getByteFrequencyData(data);
        const energy = data.reduce((sum, value) => sum + value, 0) / data.length;
        if (energy > 14) {
          void postEvent(event({ type: 'participant.speaking', participantId: LOCAL_USER_ID, seconds: 1 }));
        }
      }, 1300);
    } catch {
      setMediaState('denied');
      await postEvent(event({ type: 'participant.media_updated', participantId: LOCAL_USER_ID, media: { webcamOn: false, audioOn: false } }));
    }
  };

  return { mediaState, videoRef, startCamera };
}
