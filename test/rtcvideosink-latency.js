'use strict';

const { performance } = require('perf_hooks');
const tape = require('tape');

const { RTCVideoSink, RTCVideoSource } = require('..');

const { I420Frame } = require('./lib/frame');
const { negotiateRTCPeerConnections } = require('./lib/pc');
const { printTimestampI420, readTimestampI420 } = require('./lib/timestamp');

function average(xs) {
  return xs.reduce((y, x) => y + x, 0) / xs.length;
}

function measureTimeToPrintAndReadTimestamp(width, height, n) {
  n = typeof n === 'number' ? n : 300;

  const frame = new I420Frame(width, height);
  const times = [];

  for (let i = 0; i < n; i++) {
    const before = performance.now();
    printTimestampI420(frame);
    readTimestampI420(frame);
    const after = performance.now();
    const time = after - before;
    times.push(time);
  }

  return average(times);
}

async function measureTimeFromRTCVideoSourceToRTCVideoSink(source, sink, width, height, n) {
  n = typeof n === 'number' ? n : 300;

  const inputFrame = new I420Frame(width, height);

  const averageTimeToPrintAndReadTimestamp = measureTimeToPrintAndReadTimestamp(width, height, n);

  const times = [];

  sink.onframe = outputFrame => {
    if (times.length < n) {
      const timestamp = readTimestampI420(outputFrame);
      const time = performance.now() - timestamp;
      times.push(time);
    }
  };

  while (times.length < n) {
    printTimestampI420(inputFrame);
    source.onFrame(inputFrame);
    await new Promise(resolve => setTimeout(resolve));
  }

  return average(times) - averageTimeToPrintAndReadTimestamp;
}

async function measureTimeFromRTCVideoSourceToLocalRTCVideoSink(width, height, n) {
  const source = new RTCVideoSource();
  const track = source.createTrack();
  const sink = new RTCVideoSink(track);
  try {
    return await measureTimeFromRTCVideoSourceToRTCVideoSink(source, sink, width, height, n);
  } catch (error) {
    throw error;
  } finally {
    sink.stop();
    track.stop();
  }
}

async function measureTimeFromRTCVideoSourceToRemoteRTCVideoSink(width, height, n) {
  const source = new RTCVideoSource();
  const localTrack = source.createTrack();
  try {
    const [pc1, pc2] = await negotiateRTCPeerConnections({
      withPc1(pc1) {
        pc1.addTrack(localTrack);
      }
    });
    try {
      const remoteTrack = pc2.getReceivers()[0].track;
      const sink = new RTCVideoSink(remoteTrack);
      try {
        return await measureTimeFromRTCVideoSourceToRTCVideoSink(source, sink, width, height, n);
      } catch (error) {
        throw error;
      } finally {
        sink.stop();
      }
    } catch (error) {
      throw error;
    } finally {
      pc1.close();
      pc2.close();
    }
  } catch (error) {
    throw error;
  } finally {
    localTrack.stop();
  }
}

function testTimeFromRTCVideoSourceToLocalVideoSink(t, width, height) {
  t.test(`Average Time from RTCVideoSource to Local RTCVideoSink (${width} x ${height})`, async t => {
    const averageLatency = await measureTimeFromRTCVideoSourceToLocalRTCVideoSink(width, height, 300);
    console.log(`#
#  ${averageLatency} ms
#
`);
    t.end();
  });
}

function testTimeFromRTCVideoSourceToRemoteVideoSink(t, width, height) {
  t.test(`Average Time from RTCVideoSource to Remote RTCVideoSink (${width} x ${height})`, async t => {
    const averageLatency = await measureTimeFromRTCVideoSourceToRemoteRTCVideoSink(width, height, 300);
    console.log(`#
#  ${averageLatency} ms
#
`);
    t.end();
  });
}

testTimeFromRTCVideoSourceToLocalVideoSink(tape,  160, 120);
testTimeFromRTCVideoSourceToLocalVideoSink(tape,  320, 240);
testTimeFromRTCVideoSourceToLocalVideoSink(tape,  640, 480);
testTimeFromRTCVideoSourceToLocalVideoSink(tape, 1280, 720);

testTimeFromRTCVideoSourceToRemoteVideoSink(tape,  160, 120);
testTimeFromRTCVideoSourceToRemoteVideoSink(tape,  320, 240);
testTimeFromRTCVideoSourceToRemoteVideoSink(tape,  640, 480);
testTimeFromRTCVideoSourceToRemoteVideoSink(tape, 1280, 720);