// class PCMProcessor extends AudioWorkletProcessor {
//   constructor() {
//     super();
//     this.buffer = new Float32Array(0);
//     this.chunkSize = Math.floor(16000 * 0.1); // 100ms = 1600 samples
//     this.initialChunkSize = Math.floor(16000 * 0.2); // 200ms = 3200 samples
//     this.isFirstChunk = true;
//     this.lastChunkTime = 0;
//     this.keepAliveInterval = 5000;
//   }

//   process(inputs, outputs, parameters) {
//     const input = inputs[0];
//     const currentTime = Date.now();

//     // Send keep-alive chunk if no audio sent for 5s
//     if (
//       currentTime - this.lastChunkTime >= this.keepAliveInterval &&
//       this.buffer.length === 0
//     ) {
//       const keepAliveChunk = new Float32Array(this.chunkSize).fill(0.0001);
//       this.port.postMessage(keepAliveChunk);
//       this.lastChunkTime = currentTime;
//       console.log("Sent keep-alive chunk to prevent STT timeout");
//     }

//     if (input.length > 0) {
//       const inputData = input[0];
//       // Amplify input to improve clarity
//       const amplifiedData = new Float32Array(inputData.length);
//       for (let i = 0; i < inputData.length; i++) {
//         amplifiedData[i] = inputData[i] * 3; // Increase gain by 3x
//       }

//       // Check if the buffer is silent (amplitude < 0.002)
//       let isSilent = true;
//       for (let i = 0; i < amplifiedData.length; i++) {
//         if (Math.abs(amplifiedData[i]) > 0.002) {
//           isSilent = false;
//           break;
//         }
//       }
//       if (isSilent && this.buffer.length === 0) {
//         console.log("Skipped silent audio chunk");
//         return true;
//       }

//       // Append to accumulator
//       const newBuffer = new Float32Array(
//         this.buffer.length + amplifiedData.length
//       );
//       newBuffer.set(this.buffer);
//       newBuffer.set(amplifiedData, this.buffer.length);
//       this.buffer = newBuffer;

//       // Use larger chunk size for first chunk
//       const targetChunkSize = this.isFirstChunk
//         ? this.initialChunkSize
//         : this.chunkSize;
//       while (this.buffer.length >= targetChunkSize) {
//         const chunk = this.buffer.slice(0, targetChunkSize);
//         this.port.postMessage(chunk);
//         this.buffer = this.buffer.slice(targetChunkSize);
//         this.lastChunkTime = currentTime;
//         if (this.isFirstChunk) {
//           this.isFirstChunk = false;
//           console.log("Sent first audio chunk (200ms)");
//         }
//       }
//     }
//     return true;
//   }
// }

// registerProcessor("pcm-processor", PCMProcessor);
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
    // 🔥 FIX 1: Reduce chunk size for lower latency (e.g., 40ms)
    this.chunkSize = Math.floor(16000 * 0.04); // 40ms = 640 samples
    // 🔥 FIX 2: Set initial chunk size to be the same as the regular chunk size.
    // The initial larger chunk adds unnecessary delay.
    this.initialChunkSize = this.chunkSize;
    this.isFirstChunk = true;
    // ... (keep lastChunkTime and keepAliveInterval)
    this.lastChunkTime = 0;
    this.keepAliveInterval = 5000;
    // Track total samples sent for debugging
    this.totalSamplesSent = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const currentTime = Date.now();

    // The keep-alive chunk logic can remain but is less critical than processing
    // Send keep-alive chunk if no audio sent for 5s
    // if (
    //   currentTime - this.lastChunkTime >= this.keepAliveInterval &&
    //   this.buffer.length === 0
    // ) {
    //   const keepAliveChunk = new Float32Array(this.chunkSize).fill(0.0001);
    //   this.port.postMessage(keepAliveChunk);
    //   this.lastChunkTime = currentTime;
    //   console.log("Sent keep-alive chunk to prevent STT timeout");
    // }

    if (input.length > 0) {
      const inputData = input[0]; // Amplify input to improve clarity (Keep for accuracy)
      const amplifiedData = new Float32Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        amplifiedData[i] = Math.max(-1, Math.min(1, inputData[i] * 2));
        // Increase gain by 3x
      } // 🔥 FIX 3: REMOVE SILENCE/VAD CHECK HERE. // Append to accumulator

      // VAD logic is slow and better handled by Google STT's internal VAD/EOU detection.
      // Your VAD logic was blocking the stream unnecessarily.

      const newBuffer = new Float32Array(
        this.buffer.length + amplifiedData.length
      );
      newBuffer.set(this.buffer);
      newBuffer.set(amplifiedData, this.buffer.length);
      this.buffer = newBuffer; // Use smaller, fixed chunk size immediately

      const targetChunkSize = this.chunkSize;

      while (this.buffer.length >= targetChunkSize) {
        const chunk = this.buffer.slice(0, targetChunkSize);
        this.port.postMessage(chunk);
        this.buffer = this.buffer.slice(targetChunkSize);
        this.lastChunkTime = currentTime;

        this.totalSamplesSent += chunk.length;
        if (this.isFirstChunk) {
          this.isFirstChunk = false;
          console.log(
            `Sent first audio chunk (40ms). Total sent: ${this.totalSamplesSent}`
          );
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);
