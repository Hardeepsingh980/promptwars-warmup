/** Audio worklet that copies microphone samples (mono) to the main thread. */
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);
