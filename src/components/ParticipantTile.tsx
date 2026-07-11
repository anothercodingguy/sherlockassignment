import React from 'react';
import type { Participant } from '../../shared/types';
import { LOCAL_USER_ID } from '../constants';

const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

interface ParticipantTileProps {
  participant: Participant;
  localVideo?: React.RefObject<HTMLVideoElement | null>;
}

export function ParticipantTile({ participant, localVideo }: ParticipantTileProps) {
  const isCandidateLeader = participant.id === LOCAL_USER_ID;
  
  return (
    <article className={`participant-tile ${isCandidateLeader ? 'candidate-tile' : ''}`}>
      {localVideo ? (
        <video ref={localVideo} autoPlay muted playsInline className="local-video" />
      ) : (
        <div className="avatar" aria-hidden="true">{initials(participant.displayName)}</div>
      )}
      <div className="tile-shade" />
      <div className="tile-top">
        <div className="tile-badges">
          {participant.media.webcamOn ? (
            <span className="badge badge-camera active">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" style={{marginRight: 4}}>
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <span>Live</span>
            </span>
          ) : (
            <span className="badge badge-camera">
              <span>CAM OFF</span>
            </span>
          )}
        </div>
        {participant.speakingSeconds > 0 && <span className="speaking-dot" title="Speaking activity observed" />}
      </div>
      <div className="tile-bottom">
        <strong className="displayName">{participant.displayName}</strong>
        <span className="subtext">{participant.email ?? (localVideo ? 'Local browser feed' : 'Audio feed only')}</span>
      </div>
    </article>
  );
}
