'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('Click "Start Recording" to ask a question.');
  const [aiResponse, setAiResponse] = useState('');
  
  // NEW: State to track if the AI is currently speaking
  const [isSpeaking, setIsSpeaking] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioBlobRef = useRef(null);

  // This effect runs once to ensure the browser's voice list is loaded.
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const initVoices = () => window.speechSynthesis.getVoices();
      initVoices();
      window.speechSynthesis.onvoiceschanged = initVoices;
    }
  }, []);

  // UPDATED: Text-to-speech function with voice selection and state handling
  const speakText = (text) => {
    if (!('speechSynthesis' in window)) {
      alert("Sorry, your browser does not support text-to-speech.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);

    // --- Voice Selection Logic ---
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = voices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('female'));
    if (!selectedVoice) selectedVoice = voices.find(voice => voice.name.toLowerCase().includes('female'));
    if (!selectedVoice) selectedVoice = voices.find(voice => voice.lang === 'en-US');

    if (selectedVoice) {
      console.log("Using voice:", selectedVoice.name);
      utterance.voice = selectedVoice;
    }
    // --- End Voice Selection ---

    // NEW: Handlers to track when speech starts and ends
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel(); // Cancel any previous speech
    window.speechSynthesis.speak(utterance);
  };

  // NEW: Function for the "Stop Speaking" button
  const handleStopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const startRecording = () => {
    // Reset states for a new interaction
    setAudioURL('');
    setAiResponse('');
    setIsSpeaking(false);
    window.speechSynthesis.cancel();
    audioBlobRef.current = null;
    setStatusText('Recording...');
    
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      setIsRecording(true);
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const audioChunks = [];
      mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioBlobRef.current = audioBlob;
        setAudioURL(URL.createObjectURL(audioBlob));
        setStatusText('Recording finished. Click "Ask AI".');
      };
      mediaRecorder.start();
    }).catch(error => {
      console.error("Mic error:", error);
      setStatusText("Error: Could not access microphone.");
    });
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      setIsRecording(false);
      mediaRecorderRef.current.stop();
    }
  };

  // UPDATED: Main function to handle audio sending and response
  const handleSendAudio = async () => {
    if (!audioBlobRef.current) return;
    
    setIsProcessing(true);
    setStatusText('Sending audio to Gemini...');
    const formData = new FormData();
    formData.append('audio', audioBlobRef.current, 'my-audio.webm');

    try {
      const response = await fetch('http://localhost:5000/api/process-audio', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Server error');
      
      // NEW: Sanitize the text to remove markdown characters like '*' and '#'
      const sanitizedText = data.ai_response.replace(/[*#]/g, '').trim();

      setAiResponse(sanitizedText); // Display the clean text
      setStatusText('AI response received.');
      speakText(sanitizedText); // Speak the clean text

    } catch (error) {
      console.error('Error:', error);
      setStatusText(`Error: ${error.message}`);
      setAiResponse('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-900 text-white">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-5xl font-bold mb-4">Voice AI Chatbot (Final Version)</h1>
        <p className="mb-8 text-lg text-gray-400">{statusText}</p>

        <button 
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className="px-8 py-4 text-xl font-bold rounded-full transition-all duration-300 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500"
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>

        {audioURL && (
          <div className="mt-8 p-6 bg-gray-800 rounded-lg">
            <h2 className="text-2xl font-semibold mb-4">Your Question</h2>
            <audio controls src={audioURL} className="w-full"></audio>
            <button 
              onClick={handleSendAudio}
              disabled={isProcessing}
              className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white text-lg font-bold py-3 px-4 rounded-lg disabled:bg-gray-500"
            >
              {isProcessing ? 'Thinking...' : 'Ask AI'}
            </button>
          </div>
        )}
        
        {/* The AI response box */}
        {aiResponse && (
           <div className="mt-8 p-6 bg-gray-700 rounded-lg text-left">
             <h2 className="text-2xl font-semibold mb-2">AI Response</h2>
             <p className="text-gray-300 text-lg whitespace-pre-wrap">{aiResponse}</p>
           </div>
        )}

        {/* NEW: The "Stop Speaking" button, which only appears when the AI is talking */}
        {isSpeaking && (
          <button 
            onClick={handleStopSpeaking}
            className="mt-8 px-6 py-3 font-bold rounded-full bg-red-600 hover:bg-red-700 transition-all duration-300"
          >
            Stop Speaking
          </button>
        )}

      </div>
    </main>
  );
}