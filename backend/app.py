import os
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import time
import soundfile as sf
import librosa

# Load environment variables from .env file
load_dotenv()

# Initialize the Flask app and configure the Gemini API
app = Flask(__name__)
CORS(app)
try:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GOOGLE_API_KEY not found. Please set it in your .env file.")
    genai.configure(api_key=api_key)
    print("Google Gemini API configured successfully.")
except Exception as e:
    print(f"Error configuring Google Gemini API: {e}")

# Create a directory for uploads if it doesn't exist
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route("/api/process-audio", methods=['POST', 'OPTIONS'])
def process_audio():
    if request.method == 'OPTIONS':
        return '', 204

    if 'audio' not in request.files:
        return jsonify({"error": "No audio file part"}), 400

    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Save the original webm file
    webm_path = os.path.join(UPLOAD_FOLDER, 'user_audio.webm')
    audio_file.save(webm_path)
    print(f"User audio (webm) saved to {webm_path}")

    # Convert webm to mp3
    mp3_path = os.path.join(UPLOAD_FOLDER, 'user_audio.mp3')
    try:
        y, sr = librosa.load(webm_path, sr=16000) # Downsample to 16kHz
        sf.write(mp3_path, y, sr)
        print(f"Audio converted to mp3: {mp3_path}")
    except Exception as e:
        return jsonify({"error": f"Failed to convert audio file: {e}"}), 500

    gemini_file = None
    try:
        print("Uploading file to Gemini...")
        gemini_file = genai.upload_file(path=mp3_path) # Upload the converted mp3
        
        print(f"Waiting for file processing... Current state: {gemini_file.state.name}")
        while gemini_file.state.name == "PROCESSING":
            time.sleep(2)
            gemini_file = genai.get_file(name=gemini_file.name)
            print(f"Current state: {gemini_file.state.name}")

        if gemini_file.state.name != "ACTIVE":
            raise ValueError(f"File processing failed on Google's servers. Final state: {gemini_file.state.name}")

        print("File is active. Generating content with Gemini 1.5 Flash...")
        model = genai.GenerativeModel(model_name="models/gemini-1.5-flash-latest")
        prompt = "Listen to this audio and provide a simple, concise answer to the user's question."
        response = model.generate_content([prompt, gemini_file])
        
        ai_response_text = response.text
        print(f"AI response generated: '{ai_response_text}'")

        return jsonify({"ai_response": ai_response_text})

    except Exception as e:
        error_message = f"An error occurred: {e}"
        print(error_message)
        return jsonify({"error": error_message}), 500
    finally:
        # Clean up the uploaded files
        if gemini_file:
            print(f"Deleting uploaded file: {gemini_file.name}")
            genai.delete_file(gemini_file.name)
        if os.path.exists(webm_path):
            os.remove(webm_path)
        if os.path.exists(mp3_path):
            os.remove(mp3_path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)