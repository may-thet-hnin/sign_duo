export function releaseCamera(video, stream) {
  if (video) video.srcObject = null;
  stream?.getTracks().forEach(track => track.stop());
}
