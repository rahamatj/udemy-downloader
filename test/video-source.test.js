const test = require('node:test');
const assert = require('node:assert/strict');

const { collectVideoSources, isVideoSource } = require('../src/index.js');

test('collectVideoSources accepts non-video/mp4 Udemy HLS sources', () => {
  const asset = {
    media_sources: [
      {
        type: 'application/x-mpegURL',
        src: 'https://example.com/playlist.m3u8',
        label: '720P'
      }
    ],
    download_urls: {
      Video: [
        { label: '480P', file: 'https://example.com/video.mp4' }
      ]
    }
  };

  const sources = collectVideoSources(asset);

  assert.equal(sources.length, 2);
  assert.ok(sources.some((item) => item.src.includes('playlist.m3u8')));
  assert.ok(sources.some((item) => item.src.includes('video.mp4')));
  assert.equal(isVideoSource({ type: 'application/vnd.apple.mpegurl', src: 'https://example.com/master.m3u8' }), true);
});

test('collectVideoSources ignores non-video data sources', () => {
  const asset = {
    media_sources: [
      { type: 'audio/mp4', src: 'https://example.com/audio.m4a', label: 'Audio' }
    ],
    download_urls: {
      Slides: [{ file: 'https://example.com/slide.pdf' }]
    }
  };

  assert.deepEqual(collectVideoSources(asset), []);
});
