// Sound Manager for Guestbook Application
export class SoundManager {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;

  constructor() {
    this.initAudio();
  }

  private initAudio() {
    try {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0.3; // Set volume to 30%
    } catch (error) {
      console.warn('Audio context not supported, sounds will be disabled');
    }
  }

  // Play a beep sound for numberpad buttons
  playBeep(frequency: number = 800, duration: number = 100) {
    if (!this.audioContext || !this.gainNode) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.gainNode);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + duration / 1000
      );

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration / 1000);
    } catch (error) {
      console.warn('Failed to play beep sound:', error);
    }
  }

  // Play success sound
  playSuccess() {
    this.playBeep(1000, 200);
  }

  // Play error sound
  playError() {
    this.playBeep(400, 300);
  }

  // Play number button sound
  playNumberBeep() {
    this.playBeep(600, 80);
  }
}

// Create and export a singleton instance
export const soundManager = new SoundManager();
