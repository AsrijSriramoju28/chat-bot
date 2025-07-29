'use client';

import { useState, useRef } from 'react';

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('Click "Start Recording" to ask a question.');
  const [aiResponse, setAiResponse] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioBlobRef = useRef(null);

  // =================================================================
  // === UPDATED AND MORE ROBUST TEXT-TO-SPEECH FUNCTION ===========
  // =================================================================
  const speakText = (text) => {
    // 1. Check if the browser supports speech synthesis
    if (!('speechSynthesis' in window)) {
      alert("Sorry, your browser does not support text-to-speech.");
      return;
    }

    // 2. Clean up the text - Gemini often adds newlines (\n)
    const textToSpeak = text.trim();
    console.log("Attempting to speak:", textToSpeak);

    // 3. Create a new speech utterance
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Optional: Configure voice, pitch, and rate
    utterance.lang = 'en-US'; // Set language
    utterance.pitch = 1;      // Range between 0 and 2
    utterance.rate = 1;       // Range between 0.1 and 10

    // 4. Important: Cancel any previous speech to prevent overlap
    window.speechSynthesis.cancel();
    
    // 5. Speak the new utterance
    window.speechSynthesis.speak(utterance);
  };
  // =================================================================

  const startRecording = () => {
    setAudioURL('');
    setAiResponse('');
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
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
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

      if (!response.ok) {
        throw new Error(data.error || 'Server error');
      }

      const aiText = data.ai_response;
      setAiResponse(aiText);
      setStatusText('AI response received.');
      
      // Use our robust function to speak the response
      speakText(aiText);

    } catch (error) {
      console.error('Error:', error);
      setStatusText(`Error: ${error.message}`);
      setAiResponse('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Renamed the title for clarity
  const aiResponseTitle = "Gemini's Response:";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-900 text-white">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-5xl font-bold mb-4">Voice AI Chatbot (Gemini Edition)</h1>
        <p className="mb-8 text-lg text-gray-400">{statusText}</p>

        <button 
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={`px-8 py-4 text-xl font-bold rounded-full transition-all duration-300 ${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'} disabled:bg-gray-500`}
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
        
        {aiResponse && (
           <div className="mt-8 p-6 bg-gray-700 rounded-lg text-left">
             <h2 className="text-2xl font-semibold mb-2">{aiResponseTitle}</h2>
             <p className="text-gray-300 text-lg whitespace-pre-wrap">{aiResponse}</p>
           </div>
        )}
      </div>
    </main>
  );
}