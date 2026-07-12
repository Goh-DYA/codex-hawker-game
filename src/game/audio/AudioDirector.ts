/** Small, original procedural sound palette. No audio is downloaded or tracked. */
export class AudioDirector {
  private context?: AudioContext;
  private ambienceTimer?: number;
  private musicVolume = 0.32;
  private sfxVolume = 0.55;

  setVolumes(music: number, sfx: number) {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
  }

  async unlock() {
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }

  startAmbience() {
    if (this.ambienceTimer || this.musicVolume === 0) return;
    this.ambienceTimer = window.setInterval(() => {
      if (document.hidden) return;
      const note = [196, 220, 247, 294][Math.floor(Math.random() * 4)];
      this.tone(note, 0.55, this.musicVolume * 0.045, "sine");
    }, 2600);
  }

  stopAmbience() {
    if (this.ambienceTimer) window.clearInterval(this.ambienceTimer);
    this.ambienceTimer = undefined;
  }

  play(
    cue: "place" | "invalid" | "sale" | "reward" | "ui" | "open" | "close",
  ) {
    const patterns: Record<typeof cue, readonly [number, number, OscillatorType][]> = {
      place: [[330, 0.08, "sine"]],
      invalid: [[145, 0.16, "square"]],
      sale: [[523, 0.08, "sine"], [659, 0.12, "sine"]],
      reward: [[392, 0.08, "triangle"], [523, 0.09, "triangle"], [784, 0.18, "triangle"]],
      ui: [[260, 0.045, "sine"]],
      open: [[294, 0.08, "triangle"], [440, 0.14, "triangle"]],
      close: [[440, 0.08, "triangle"], [294, 0.14, "triangle"]],
    };
    patterns[cue].forEach(([frequency, duration, type], index) => {
      window.setTimeout(
        () => this.tone(frequency, duration, this.sfxVolume * 0.12, type),
        index * 75,
      );
    });
  }

  destroy() {
    this.stopAmbience();
    void this.context?.close();
    this.context = undefined;
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
  ) {
    if (!this.context || volume <= 0) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      this.context.currentTime + duration,
    );
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }
}
