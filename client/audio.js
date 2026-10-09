export function createAudio() {
  let context,
    master,
    volume = 0.45,
    lastFootstep = 0;
  const start = () => {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = volume * 0.28;
      master.connect(context.destination);
    }
    if (context.state === "suspended") context.resume();
  };
  function tone(
    frequency,
    duration,
    type = "sine",
    gain = 0.2,
    end = frequency,
  ) {
    if (!context || !volume) return;
    const oscillator = context.createOscillator(),
      envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, end),
      context.currentTime + duration,
    );
    envelope.gain.setValueAtTime(gain, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + duration,
    );
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }
  function noise(duration = 0.15, gain = 0.3) {
    if (!context || !volume) return;
    const buffer = context.createBuffer(
      1,
      context.sampleRate * duration,
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      envelope = context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    envelope.gain.value = gain;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start();
  }
  return {
    start,
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v * 0.28;
    },
    action(event) {
      if (event.kind === "attack") {
        noise(0.18, 0.6);
        tone(380, 0.13, "triangle", 0.2, 90);
      }
      if (event.kind === "ability") {
        noise(0.5, 0.55);
        tone(event.style === "thunder" ? 1300 : 260, 0.6, "sine", 0.25, 80);
        tone(520, 0.8, "sine", 0.18, 1040);
      }
      if (event.kind === "hit") {
        noise(0.08, 0.5);
        tone(110, 0.13, "triangle", 0.3, 40);
      }
      if (event.kind === "parry") {
        tone(1700, 0.6, "sine", 0.3, 2200);
        tone(2400, 0.4, "sine", 0.2);
      }
      if (event.kind === "dash") noise(0.22, 0.35);
      if (event.kind === "reward") {
        tone(440, 0.3, "sine", 0.2);
        setTimeout(() => tone(660, 0.4, "sine", 0.2), 120);
        setTimeout(() => tone(880, 0.6, "sine", 0.2), 240);
      }
    },
    footstep(time) {
      if (time - lastFootstep > 0.33) {
        lastFootstep = time;
        noise(0.055, 0.15);
      }
    },
  };
}
