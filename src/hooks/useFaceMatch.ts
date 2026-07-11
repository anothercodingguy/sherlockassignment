import { ChangeEvent, useState } from 'react';
import type { MeetingEvent } from '../../shared/types';
import { LOCAL_USER_ID } from '../constants';

const percentage = (value: number) => `${Math.round(value * 100)}%`;

async function localVisualSimilarity(referenceUrl: string, video: HTMLVideoElement): Promise<number> {
  const image = new Image();
  image.src = referenceUrl;
  await image.decode();
  if (!video.videoWidth || !video.videoHeight) throw new Error('Start your camera before comparing the local visual reference.');
  const referenceCanvas = document.createElement('canvas');
  const liveCanvas = document.createElement('canvas');
  referenceCanvas.width = liveCanvas.width = 32;
  referenceCanvas.height = liveCanvas.height = 32;
  referenceCanvas.getContext('2d')!.drawImage(image, 0, 0, 32, 32);
  liveCanvas.getContext('2d')!.drawImage(video, 0, 0, 32, 32);
  const a = referenceCanvas.getContext('2d')!.getImageData(0, 0, 32, 32).data;
  const b = liveCanvas.getContext('2d')!.getImageData(0, 0, 32, 32).data;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < a.length; index += 4) {
    const luminanceA = 0.2126 * a[index] + 0.7152 * a[index + 1] + 0.0722 * a[index + 2];
    const luminanceB = 0.2126 * b[index] + 0.7152 * b[index + 1] + 0.0722 * b[index + 2];
    dot += luminanceA * luminanceB;
    magnitudeA += luminanceA ** 2;
    magnitudeB += luminanceB ** 2;
  }
  return dot / Math.sqrt(magnitudeA * magnitudeB);
}

export function useFaceMatch(postEvent: (event: MeetingEvent) => Promise<void>) {
  const [faceConsent, setFaceConsent] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState<string>();
  const [referenceName, setReferenceName] = useState<string>();
  const [visualMessage, setVisualMessage] = useState('No reference image is retained by the server.');

  const onReferenceSelected = (selected: ChangeEvent<HTMLInputElement>) => {
    const file = selected.target.files?.[0];
    if (!file) return;
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    setReferenceUrl(URL.createObjectURL(file));
    setReferenceName(file.name);
    setVisualMessage('Reference ready locally. Consent is required before comparison.');
  };

  const compareReference = async (videoElement: HTMLVideoElement | null) => {
    if (!referenceUrl || !faceConsent || !videoElement) return;
    try {
      const similarity = await localVisualSimilarity(referenceUrl, videoElement);
      await postEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'face.match',
        participantId: LOCAL_USER_ID,
        similarity,
        consented: true
      });
      setVisualMessage(`Local prototype visual comparison completed: ${percentage(similarity)} similarity. No image bytes left this browser.`);
    } catch (reason) {
      setVisualMessage(reason instanceof Error ? reason.message : 'Visual comparison failed.');
    }
  };

  const clearReference = () => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    setReferenceUrl(undefined);
    setReferenceName(undefined);
    setFaceConsent(false);
    setVisualMessage('Local reference deleted from this browser session.');
  };

  return {
    faceConsent,
    setFaceConsent,
    referenceUrl,
    referenceName,
    visualMessage,
    onReferenceSelected,
    compareReference,
    clearReference
  };
}
