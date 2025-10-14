// // pcm-processor.js
// class PCMProcessor extends AudioWorkletProcessor {
//   process(inputs) {
//     const input = inputs[0];
//     if (input && input[0]) {
//       this.port.postMessage(input[0]);
//     }
//     return true;
//   }
// }
// registerProcessor("pcm-processor", PCMProcessor);
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
    // 🔥 FIX 1: Reduce chunk size to 40ms for low latency
    this.chunkSize = Math.floor(16000 * 0.04); // 40ms = 640 samples
    // 🔥 FIX 2: Set initial chunk size to be the same
    this.initialChunkSize = this.chunkSize;
    this.isFirstChunk = true;
    this.lastChunkTime = 0;
    // Removed keepAliveInterval as it is not needed
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const currentTime = Date.now();

    if (input.length > 0) {
      const inputData = input[0]; // Amplify input. (Adjust the multiplier '2' if needed)
      const amplifiedData = new Float32Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        amplifiedData[i] = inputData[i] * 2.0;
      } // 🔥 FIX 3: Removed the entire VAD/Silence checking logic here. // Append to accumulator

      // This allows the STT server to handle EOU detection accurately.

      const newBuffer = new Float32Array(
        this.buffer.length + amplifiedData.length
      );
      newBuffer.set(this.buffer);
      newBuffer.set(amplifiedData, this.buffer.length);
      this.buffer = newBuffer; // Use fixed chunk size (40ms) immediately

      const targetChunkSize = this.chunkSize;

      while (this.buffer.length >= targetChunkSize) {
        const chunk = this.buffer.slice(0, targetChunkSize);
        this.port.postMessage(chunk);
        this.buffer = this.buffer.slice(targetChunkSize);
        this.lastChunkTime = currentTime;
        if (this.isFirstChunk) {
          this.isFirstChunk = false;
          console.log("Sent first audio chunk (40ms)");
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
