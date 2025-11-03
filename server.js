const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');

require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const users = []; // In-memory storage for demo
const upload = multer({ dest: 'uploads/' });

const app = express();

const PORT = process.env.PORT || 5001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get('/', (req, res) => {
  res.send('AI Interview Simulator Backend');
});

// Enhanced question bank with categories
const questionBank = {
  technical: {
    easy: [
      "What programming languages are you most comfortable with?",
      "Can you explain what {technology} is and how you've used it?",
      "What is your favorite development tool and why?",
      "How do you typically debug your code?",
      "What's the difference between {concept1} and {concept2}?"
    ],
    medium: [
      "Walk me through the architecture of {project} from your resume.",
      "How would you optimize the performance of {technology} application?",
      "Explain a challenging bug you encountered and how you solved it.",
      "How do you ensure code quality in your projects?",
      "What design patterns have you used in {project}?"
    ],
    hard: [
      "Design a scalable system for {domain} with the technologies you know.",
      "How would you handle {complex_scenario} in a production environment?",
      "Explain the trade-offs between {approach1} and {approach2} for {use_case}.",
      "How would you migrate a legacy system using {old_tech} to {new_tech}?",
      "Design and implement a solution for {complex_problem}."
    ]
  },
  behavioral: {
    easy: [
      "Tell me about yourself and your background.",
      "Why are you interested in this field?",
      "What motivates you in your work?",
      "How do you handle feedback?",
      "What are your career goals?"
    ],
    medium: [
      "Describe a time when you had to learn a new technology quickly.",
      "Tell me about a project you're particularly proud of.",
      "How do you handle working under pressure?",
      "Describe a time when you had to work with a difficult team member.",
      "What's the most challenging problem you've solved?"
    ],
    hard: [
      "Tell me about a time when you failed and what you learned from it.",
      "Describe a situation where you had to make a difficult technical decision.",
      "How do you handle conflicting priorities and tight deadlines?",
      "Tell me about a time when you had to convince others of your technical approach.",
      "Describe a situation where you had to take ownership of a critical issue."
    ]
  },
  situational: {
    easy: [
      "How would you approach learning a new framework?",
      "What would you do if you encountered a technology you've never used?",
      "How do you stay updated with new technologies?",
      "What would you do if your code wasn't working as expected?",
      "How would you explain a technical concept to a non-technical person?"
    ],
    medium: [
      "How would you handle a situation where requirements change mid-project?",
      "What would you do if you disagreed with a technical decision made by your team?",
      "How would you approach optimizing a slow-performing application?",
      "What would you do if you found a security vulnerability in production?",
      "How would you handle a situation where you're behind schedule?"
    ],
    hard: [
      "How would you design a system to handle millions of users?",
      "What would you do if you had to choose between perfect code and meeting a deadline?",
      "How would you handle a critical production outage?",
      "What would you do if you discovered a major architectural flaw in a live system?",
      "How would you approach refactoring a large, legacy codebase?"
    ]
  }
};

// Function to analyze resume and extract key information
function analyzeResume(resumeText) {
  const analysis = {
    technologies: [],
    projects: [],
    experience_level: 'entry',
    domains: [],
    education: [],
    skills: []
  };

  const text = resumeText.toLowerCase();
  
  // Extract technologies
  const techKeywords = [
    'javascript', 'python', 'java', 'react', 'node.js', 'angular', 'vue',
    'html', 'css', 'sql', 'mongodb', 'postgresql', 'mysql', 'docker',
    'kubernetes', 'aws', 'azure', 'gcp', 'git', 'linux', 'windows',
    'c++', 'c#', '.net', 'spring', 'django', 'flask', 'express',
    'typescript', 'php', 'ruby', 'go', 'rust', 'swift', 'kotlin',
    'tensorflow', 'pytorch', 'machine learning', 'ai', 'data science'
  ];
  
  techKeywords.forEach(tech => {
    if (text.includes(tech)) {
      analysis.technologies.push(tech);
    }
  });

  // Extract project information
  const projectMatches = resumeText.match(/project[s]?[:\-\s]+(.*?)(?=\n|$)/gi);
  if (projectMatches) {
    analysis.projects = projectMatches.slice(0, 3).map(match =>
      match.replace(/project[s]?[:\-\s]+/i, '').trim()
    );
  }

  // Determine experience level
  const experienceIndicators = {
    senior: ['senior', 'lead', 'architect', 'principal', '5+ years', '6+ years', '7+ years'],
    mid: ['mid-level', '2+ years', '3+ years', '4+ years', 'experienced'],
    entry: ['intern', 'junior', 'entry', 'graduate', 'fresh', 'new grad']
  };

  for (const [level, indicators] of Object.entries(experienceIndicators)) {
    if (indicators.some(indicator => text.includes(indicator))) {
      analysis.experience_level = level;
      break;
    }
  }

  // Extract domains
  const domainKeywords = [
    'web development', 'mobile development', 'data science', 'machine learning',
    'devops', 'cloud computing', 'cybersecurity', 'game development',
    'blockchain', 'iot', 'embedded systems', 'fintech', 'healthcare',
    'e-commerce', 'social media', 'education technology'
  ];

  domainKeywords.forEach(domain => {
    if (text.includes(domain)) {
      analysis.domains.push(domain);
    }
  });

  return analysis;
}

// Function to generate personalized questions based on resume analysis
function generatePersonalizedQuestions(analysis, questionCount = 10) {
  const questions = [];
  const { technologies, projects, experience_level, domains } = analysis;
  
  // Determine difficulty distribution based on experience level
  let difficultyDistribution;
  switch (experience_level) {
    case 'senior':
      difficultyDistribution = { easy: 2, medium: 4, hard: 4 };
      break;
    case 'mid':
      difficultyDistribution = { easy: 3, medium: 5, hard: 2 };
      break;
    default:
      difficultyDistribution = { easy: 5, medium: 4, hard: 1 };
  }

  // Generate technical questions
  const techQuestions = [];
  Object.entries(difficultyDistribution).forEach(([difficulty, count]) => {
    const categoryQuestions = questionBank.technical[difficulty];
    for (let i = 0; i < Math.ceil(count * 0.6); i++) {
      let question = categoryQuestions[Math.floor(Math.random() * categoryQuestions.length)];
      
      // Personalize with resume content
      if (technologies.length > 0) {
        question = question.replace('{technology}', technologies[Math.floor(Math.random() * technologies.length)]);
      }
      if (projects.length > 0) {
        question = question.replace('{project}', projects[Math.floor(Math.random() * projects.length)]);
      }
      
      techQuestions.push({
        question,
        category: 'technical',
        difficulty,
        type: 'resume-based'
      });
    }
  });

  // Generate behavioral questions
  const behavioralQuestions = [];
  Object.entries(difficultyDistribution).forEach(([difficulty, count]) => {
    const categoryQuestions = questionBank.behavioral[difficulty];
    for (let i = 0; i < Math.ceil(count * 0.3); i++) {
      const question = categoryQuestions[Math.floor(Math.random() * categoryQuestions.length)];
      behavioralQuestions.push({
        question,
        category: 'behavioral',
        difficulty,
        type: 'general'
      });
    }
  });

  // Generate situational questions
  const situationalQuestions = [];
  Object.entries(difficultyDistribution).forEach(([difficulty, count]) => {
    const categoryQuestions = questionBank.situational[difficulty];
    for (let i = 0; i < Math.ceil(count * 0.1); i++) {
      const question = categoryQuestions[Math.floor(Math.random() * categoryQuestions.length)];
      situationalQuestions.push({
        question,
        category: 'situational',
        difficulty,
        type: 'scenario-based'
      });
    }
  });

  // Combine and shuffle questions
  const allQuestions = [...techQuestions, ...behavioralQuestions, ...situationalQuestions];
  
  // Sort by difficulty (easy first, then medium, then hard)
  const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
  allQuestions.sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]);
  
  return allQuestions.slice(0, questionCount);
}

app.post('/generate-questions', async (req, res) => {
  const { resumeText, questionCount = 10, useAI = true } = req.body;
  
  try {
    // Analyze resume to extract key information
    const resumeAnalysis = analyzeResume(resumeText);
    
    if (useAI && process.env.OPENAI_API_KEY) {
      // Enhanced AI-based question generation
      const prompt = `You are an expert technical interviewer. Analyze this resume and generate ${questionCount} interview questions.

Resume Content: "${resumeText}"

Based on the resume analysis:
- Technologies found: ${resumeAnalysis.technologies.join(', ')}
- Experience level: ${resumeAnalysis.experience_level}
- Project domains: ${resumeAnalysis.domains.join(', ')}

Generate questions that:
1. Are specifically tailored to the candidate's background
2. Progress from easy to hard based on their experience level
3. Include technical, behavioral, and situational questions
4. Reference specific technologies, projects, or experiences from their resume
5. Are appropriate for their experience level

Format each question as a JSON object with:
- question: the actual question text
- category: "technical", "behavioral", or "situational"
- difficulty: "easy", "medium", or "hard"
- type: "resume-based", "general", or "scenario-based"

Return as a JSON array of question objects.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      });

      try {
        const aiQuestions = JSON.parse(response.choices[0].message.content);
        res.json({
          questions: aiQuestions,
          resumeAnalysis,
          source: 'ai'
        });
      } catch (parseError) {
        // Fallback to rule-based if AI response isn't valid JSON
        const ruleBasedQuestions = generatePersonalizedQuestions(resumeAnalysis, questionCount);
        res.json({
          questions: ruleBasedQuestions,
          resumeAnalysis,
          source: 'rule-based-fallback'
        });
      }
    } else {
      // Rule-based question generation
      const ruleBasedQuestions = generatePersonalizedQuestions(resumeAnalysis, questionCount);
      res.json({
        questions: ruleBasedQuestions,
        resumeAnalysis,
        source: 'rule-based'
      });
    }
  } catch (error) {
    console.error('Error generating questions:', error);
    
    // Enhanced fallback questions based on resume analysis
    const resumeAnalysis = analyzeResume(resumeText);
    const fallbackQuestions = generatePersonalizedQuestions(resumeAnalysis, questionCount);
    
    res.json({
      questions: fallbackQuestions,
      resumeAnalysis,
      source: 'fallback'
    });
  }
});

// Function to generate follow-up questions based on answer
function generateFollowUpQuestion(originalQuestion, answer, questionData) {
  const followUpTemplates = {
    technical: [
      "Can you explain how you would implement that in production?",
      "What are the potential drawbacks of that approach?",
      "How would you scale that solution?",
      "What alternatives did you consider?",
      "Can you walk me through the code structure for that?"
    ],
    behavioral: [
      "What would you do differently if you faced that situation again?",
      "How did that experience change your approach to similar situations?",
      "What did you learn from that experience?",
      "How did others react to your approach?",
      "What was the outcome of that situation?"
    ],
    situational: [
      "What if the requirements changed during implementation?",
      "How would you handle that with limited resources?",
      "What if that approach didn't work as expected?",
      "How would you communicate that decision to stakeholders?",
      "What metrics would you use to measure success?"
    ]
  };

  const category = questionData?.category || 'technical';
  const templates = followUpTemplates[category] || followUpTemplates.technical;
  
  // Simple logic to determine if a follow-up is needed
  const answerLength = answer.trim().split(' ').length;
  const shouldAskFollowUp = answerLength > 10 && Math.random() > 0.3;
  
  if (shouldAskFollowUp) {
    return templates[Math.floor(Math.random() * templates.length)];
  }
  
  return null;
}

app.post('/evaluate', async (req, res) => {
  const { answer, question, questionData, resumeText } = req.body;
  
  try {
    let evaluation = '';
    let followUpQuestion = null;
    
    if (process.env.OPENAI_API_KEY) {
      // AI-based evaluation
      const evaluationPrompt = `You are an expert interviewer evaluating a candidate's response.

Question: "${question}"
Question Category: ${questionData?.category || 'technical'}
Question Difficulty: ${questionData?.difficulty || 'medium'}
Candidate's Answer: "${answer}"

Evaluate the response on:
1. Technical Accuracy (if applicable)
2. Communication Clarity
3. Depth of Understanding
4. Problem-solving Approach
5. Confidence and Delivery

Provide a detailed evaluation with scores out of 10 for each relevant criterion and constructive feedback. Keep it professional and helpful.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: evaluationPrompt }],
        temperature: 0.3
      });
      
      evaluation = response.choices[0].message.content;
    } else {
      // Enhanced mock evaluation
      const scores = {
        technical: Math.floor(Math.random() * 4) + 6,
        communication: Math.floor(Math.random() * 4) + 6,
        depth: Math.floor(Math.random() * 4) + 6,
        confidence: Math.floor(Math.random() * 4) + 6
      };
      
      evaluation = `Technical Accuracy: ${scores.technical}/10
Communication Clarity: ${scores.communication}/10
Depth of Understanding: ${scores.depth}/10
Confidence: ${scores.confidence}/10

Overall Score: ${Math.round((scores.technical + scores.communication + scores.depth + scores.confidence) / 4)}/10

Feedback: ${scores.technical >= 8 ? 'Strong technical understanding demonstrated.' : 'Consider providing more technical details.'} ${scores.communication >= 8 ? 'Clear and well-structured response.' : 'Try to organize your thoughts more clearly.'} ${scores.depth >= 8 ? 'Good depth of knowledge shown.' : 'Could benefit from deeper analysis.'}`;
    }
    
    // Generate follow-up question
    followUpQuestion = generateFollowUpQuestion(question, answer, questionData);
    
    res.json({
      evaluation,
      followUpQuestion,
      hasFollowUp: !!followUpQuestion
    });
    
  } catch (error) {
    console.error('Error evaluating answer:', error);
    
    // Fallback evaluation
    const mockEvaluation = `Technical Understanding: ${Math.floor(Math.random() * 4) + 6}/10
Communication: ${Math.floor(Math.random() * 4) + 6}/10
Overall: Good response with room for improvement. Consider providing more specific examples and technical details.`;
    
    res.json({
      evaluation: mockEvaluation,
      followUpQuestion: null,
      hasFollowUp: false
    });
  }
});

// New endpoint for getting question statistics
app.get('/question-stats', (req, res) => {
  const stats = {
    totalQuestions: Object.values(questionBank).reduce((total, category) => {
      return total + Object.values(category).reduce((catTotal, difficulty) => {
        return catTotal + difficulty.length;
      }, 0);
    }, 0),
    categories: Object.keys(questionBank),
    difficulties: ['easy', 'medium', 'hard'],
    questionBank: questionBank
  };
  
  res.json(stats);
});

// New endpoint for getting questions by category and difficulty
app.post('/get-questions-by-criteria', (req, res) => {
  const { category, difficulty, count = 5 } = req.body;
  
  if (!questionBank[category] || !questionBank[category][difficulty]) {
    return res.status(400).json({ error: 'Invalid category or difficulty' });
  }
  
  const questions = questionBank[category][difficulty];
  const selectedQuestions = [];
  
  for (let i = 0; i < Math.min(count, questions.length); i++) {
    const randomIndex = Math.floor(Math.random() * questions.length);
    const question = questions[randomIndex];
    selectedQuestions.push({
      question,
      category,
      difficulty,
      type: 'bank-based'
    });
  }
  
  res.json({ questions: selectedQuestions });
});

app.post('/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    const file = req.file;
    let text = '';
    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdfParse(dataBuffer);
      text = data.text;
    } else if (file.mimetype === 'text/plain') {
      text = fs.readFileSync(file.path, 'utf8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    fs.unlinkSync(file.path); // Clean up
    res.json({ resumeText: text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auth routes
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ email, password: hashedPassword });
  res.status(201).json({ message: 'User registered' });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ email }, 'secret', { expiresIn: '1h' });
  res.json({ token });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});