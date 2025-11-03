import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [showLogin, setShowLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recognition, setRecognition] = useState(null);
  const [timer, setTimer] = useState(120); // 2 minutes
  const [resumeAnalysis, setResumeAnalysis] = useState(null);
  const [followUpQuestion, setFollowUpQuestion] = useState(null);
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [useAI, setUseAI] = useState(true);


  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5001/login', { email, password });
      localStorage.setItem('token', response.data.token);
      setIsLoggedIn(true);
    } catch (error) {
      alert('Login failed');
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:5001/register', { email, password });
      alert('Signup successful, please login');
      setShowLogin(true);
    } catch (error) {
      alert('Signup failed');
    }
  };

  const handleFileChange = (e) => {
    setResumeFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!resumeFile) return;
    const formData = new FormData();
    formData.append('resume', resumeFile);
    try {
      const response = await axios.post('http://localhost:5001/upload-resume', formData);
      setResumeText(response.data.resumeText);
    } catch (error) {
      alert('Upload failed');
    }
  };

  const stopRecording = async () => {
    if (recognition) {
      recognition.stop();
      setRecognition(null);
    }
    // Wait a bit for transcript to set
    setTimeout(async () => {
      if (transcript) {
        const newAnswers = [...answers, transcript];
        setAnswers(newAnswers);
        try {
          const currentQuestion = questions[currentIndex];
          const response = await axios.post('http://localhost:5001/evaluate', {
            answer: transcript,
            question: isFollowUp ? followUpQuestion : currentQuestion.question || currentQuestion,
            questionData: currentQuestion,
            resumeText
          });
          
          const newEvaluations = [...evaluations, response.data.evaluation];
          setEvaluations(newEvaluations);
          
          // Check if there's a follow-up question
          if (response.data.hasFollowUp && !isFollowUp) {
            setFollowUpQuestion(response.data.followUpQuestion);
            setIsFollowUp(true);
            setTimer(120);
            setTranscript('');
          } else {
            // Move to next question
            setCurrentIndex(currentIndex + 1);
            setIsFollowUp(false);
            setFollowUpQuestion(null);
            setTimer(120);
            setTranscript('');
          }
        } catch (error) {
          console.error('Error evaluating:', error);
          // Move to next question even if evaluation fails
          setCurrentIndex(currentIndex + 1);
          setIsFollowUp(false);
          setFollowUpQuestion(null);
          setTimer(120);
          setTranscript('');
        }
      }
    }, 1000);
  };

  const speakQuestion = () => {
    if ('speechSynthesis' in window) {
      const questionText = isFollowUp ? followUpQuestion : (questions[currentIndex].question || questions[currentIndex]);
      const utterance = new SpeechSynthesisUtterance(questionText);
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech not supported');
    }
  };

  const skipQuestion = () => {
    const newEvaluations = [...evaluations, 'Skipped - No answer provided.'];
    setEvaluations(newEvaluations);
    
    if (isFollowUp) {
      // Skip follow-up, move to next main question
      setCurrentIndex(currentIndex + 1);
      setIsFollowUp(false);
      setFollowUpQuestion(null);
    } else {
      // Skip main question
      setCurrentIndex(currentIndex + 1);
    }
    
    setTimer(120);
    setTranscript('');
  };

  useEffect(() => {
    if (questions.length > 0 && currentIndex < questions.length && timer > 0) {
      const interval = setInterval(() => setTimer(t => t - 1), 1000);
      return () => clearInterval(interval);
    } else if (timer === 0 && isRecording) {
      stopRecording();
    }
  }, [questions, currentIndex, timer, isRecording, stopRecording]);

  if (!isLoggedIn) {
    return (
      <div className="App">
        <div className="auth">
          <h1 className="title">AI Interview Simulator</h1>
          {showLogin ? (
            <form onSubmit={handleLogin} className="auth-form">
              <h2>Login</h2>
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" className="auth-btn">Login</button>
              <p onClick={() => setShowLogin(false)}>Don't have an account? Sign up</p>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="auth-form">
              <h2>Sign Up</h2>
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" className="auth-btn">Sign Up</button>
              <p onClick={() => setShowLogin(true)}>Already have an account? Login</p>
            </form>
          )}
        </div>
      </div>
    );
  }

  const startInterview = async () => {
    if (!resumeText) return;
    try {
      const response = await axios.post('http://localhost:5001/generate-questions', {
        resumeText,
        questionCount,
        useAI
      });
      setQuestions(response.data.questions);
      setResumeAnalysis(response.data.resumeAnalysis);
    } catch (error) {
      console.error('Error generating questions:', error);
    }
  };

  const startRecording = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition not supported');
      return;
    }
    const rec = new window.webkitSpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onstart = () => setIsRecording(true);
    rec.onresult = (event) => {
      const speechResult = event.results[0][0].transcript;
      setTranscript(speechResult);
    };
    rec.onend = () => setIsRecording(false);
    rec.start();
    setRecognition(rec);
  };


  if (questions.length === 0) {
    return (
      <div className="App">
        <div className="welcome">
          <h1 className="title">AI Interview Simulator</h1>
          <div className="resume-upload">
            <input type="file" accept=".pdf,.txt" onChange={handleFileChange} className="file-input" />
            <button className="upload-btn" onClick={handleUpload} disabled={!resumeFile}>Upload Resume</button>
            
            {resumeText && (
              <div className="interview-config">
                <h3>Interview Configuration</h3>
                
                {resumeAnalysis && (
                  <div className="resume-analysis">
                    <h4>Resume Analysis</h4>
                    <p><strong>Experience Level:</strong> {resumeAnalysis.experience_level}</p>
                    <p><strong>Technologies:</strong> {resumeAnalysis.technologies.join(', ') || 'None detected'}</p>
                    <p><strong>Domains:</strong> {resumeAnalysis.domains.join(', ') || 'None detected'}</p>
                  </div>
                )}
                
                <div className="config-options">
                  <label>
                    Number of Questions:
                    <select value={questionCount} onChange={(e) => setQuestionCount(parseInt(e.target.value))}>
                      <option value={5}>5 Questions</option>
                      <option value={10}>10 Questions</option>
                      <option value={15}>15 Questions</option>
                      <option value={20}>20 Questions</option>
                    </select>
                  </label>
                  
                  <label>
                    <input
                      type="checkbox"
                      checked={useAI}
                      onChange={(e) => setUseAI(e.target.checked)}
                    />
                    Use AI for Enhanced Question Generation
                  </label>
                </div>
              </div>
            )}
            
            <button className="start-btn" onClick={startInterview} disabled={!resumeText}>Start Interview</button>
          </div>
        </div>
      </div>
    );
  }

  if (currentIndex >= questions.length) {
    return (
      <div className="App">
        <div className="results">
          <h1 className="title">Interview Complete</h1>
          
          {resumeAnalysis && (
            <div className="interview-summary">
              <h2>Interview Summary</h2>
              <p><strong>Total Questions:</strong> {questions.length}</p>
              <p><strong>Experience Level Targeted:</strong> {resumeAnalysis.experience_level}</p>
              <p><strong>Technologies Covered:</strong> {resumeAnalysis.technologies.join(', ') || 'General'}</p>
            </div>
          )}
          
          {evaluations.map((evaluation, idx) => {
            const question = questions[idx];
            const questionText = question.question || question;
            const category = question.category || 'general';
            const difficulty = question.difficulty || 'medium';
            
            return (
              <div key={idx} className="result-item">
                <div className="question-header">
                  <h3>Question {idx + 1}: {questionText}</h3>
                  <div className="question-meta">
                    <span className={`category-badge ${category}`}>{category}</span>
                    <span className={`difficulty-badge ${difficulty}`}>{difficulty}</span>
                  </div>
                </div>
                <div className="evaluation-content">
                  <h4>Evaluation:</h4>
                  <pre>{evaluation}</pre>
                </div>
              </div>
            );
          })}
          
          <button className="restart-btn" onClick={() => window.location.reload()}>
            Start New Interview
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const questionText = isFollowUp ? followUpQuestion : (currentQuestion.question || currentQuestion);
  const category = currentQuestion.category || 'general';
  const difficulty = currentQuestion.difficulty || 'medium';

  return (
    <div className="App">
      <div className="interview">
        <h1 className="title">AI Interview</h1>
        <div className="question-container">
          <div className="interview-progress">
            <div className="progress-info">
              <span>Question {currentIndex + 1} of {questions.length}</span>
              {isFollowUp && <span className="follow-up-indicator">Follow-up Question</span>}
            </div>
            <div className="timer">Time left: {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}</div>
          </div>
          
          <div className="question-header">
            <div className="question-meta">
              <span className={`category-badge ${category}`}>{category}</span>
              <span className={`difficulty-badge ${difficulty}`}>{difficulty}</span>
              {currentQuestion.type && <span className="type-badge">{currentQuestion.type}</span>}
            </div>
          </div>
          
          <h2 className="question">
            {isFollowUp ? 'Follow-up: ' : `Question ${currentIndex + 1}: `}
            {questionText}
          </h2>
          
          <button className="speak-btn" onClick={speakQuestion}>🔊 Speak Question</button>
          
          {resumeAnalysis && (
            <div className="context-hint">
              <small>
                💡 This question is tailored to your {resumeAnalysis.experience_level} level experience
                {resumeAnalysis.technologies.length > 0 && ` in ${resumeAnalysis.technologies.slice(0, 3).join(', ')}`}
              </small>
            </div>
          )}
          
          <p className="transcript">Transcript: {transcript}</p>
          
          <div className="button-group">
            <button className={`record-btn ${isRecording ? 'recording' : ''}`} onClick={isRecording ? stopRecording : startRecording}>
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
            <button className="skip-btn" onClick={skipQuestion}>
              {isFollowUp ? 'Skip Follow-up' : 'Skip Question'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
