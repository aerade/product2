import { memo, useMemo } from 'react';
import type { Segment } from './api';

/** В старых субтитрах нет времени слов, поэтому распределяем их приблизительно. */
function timedWords(segment: Segment) {
  if (segment.words?.length) return segment.words;
  const words = segment.text.match(/\S+/g) || [];
  const weights = words.map(word => Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, '').length) + (/[.!?:;,]$/.test(word) ? 2 : 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;
  return words.map((text, index) => {
    const start_seconds = segment.start_seconds + (segment.end_seconds - segment.start_seconds) * elapsed / total;
    elapsed += weights[index];
    return { text, start_seconds, end_seconds: segment.start_seconds + (segment.end_seconds - segment.start_seconds) * elapsed / total };
  });
}

export default memo(function TranscriptText({ segment, seconds }: { segment: Segment; seconds?: number }) {
  const words = useMemo(() => timedWords(segment), [segment]);
  return <p>{words.map((word, index) => <span key={index}>
    <span className="transcript-word" data-speaking={seconds !== undefined && seconds >= word.start_seconds && seconds < word.end_seconds || undefined}>{word.text}</span>{index < words.length - 1 ? ' ' : ''}
  </span>)}</p>;
});
