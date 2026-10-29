import mammoth from 'mammoth/mammoth.browser';

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: event.data });
    if (result.value.length > 60000) throw new Error('Text limit exceeded');
    self.postMessage({ text: result.value });
  } catch { self.postMessage({ error: 'Could not read this DOCX. Export a simple document or paste its text.' }); }
};
