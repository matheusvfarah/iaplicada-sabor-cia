// Beep curto via Web Audio API — evita depender de um arquivo de áudio.
function beep(frequency: number) {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => ctx.close();
  } catch {
    // ambiente sem suporte a Web Audio — silencioso, não é crítico
  }
}

export function playNotificationSound() {
  if (localStorage.getItem("sabor-cia-som-pedido") === "false") return;
  beep(880);
}

// Preferência separada da de "novo pedido" — gestor de rede não quer
// necessariamente as duas juntas (ele não recebe pedidos, só avisos
// de horário de várias unidades).
export function playHorarioAlertSound() {
  if (localStorage.getItem("sabor-cia-som-avisos-horario") === "false") return;
  beep(660);
}
