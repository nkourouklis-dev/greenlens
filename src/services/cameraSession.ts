export function stopCameraStream(video: HTMLVideoElement | null): void {
  if (!video) return;
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

export const safariPermissionMessage = "Στο Safari, η διατήρηση άδειας κάμερας ελέγχεται από τον browser και τις ρυθμίσεις της συσκευής.";