const files = import.meta.glob<string>('./*.mp3', { eager: true, query: '?url', import: 'default' });
type Track = { name: string; url: string };

const tracks: (Track | null)[] = Array(10).fill(null);
const unnumbered: Track[] = [];
for (const [path, url] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
  const filename = path.slice(2, -4);
  const numbered = filename.match(/^(0?[1-9]|10)[\s._-]+(.+)$/);
  const name = (numbered?.[2] ?? filename).replace(/[_-]+/g, ' ').trim();
  const track = { name, url };
  if (numbered && !tracks[Number(numbered[1]) - 1]) tracks[Number(numbered[1]) - 1] = track;
  else unnumbered.push(track);
}
for (const track of unnumbered) {
  const slot = tracks.indexOf(null);
  if (slot === -1) break;
  tracks[slot] = track;
}
// Give the empty cabinet one playable demo without using up a slot when MP3s are added.
if (!tracks.some(Boolean)) tracks[0] = { name: 'After Hours (demo)', url: '/audio/jukebox-demo.wav' };

export const JUKEBOX_TRACKS = tracks;
