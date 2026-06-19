# 🎙️ AI Interviewer

<div align="center">

### AI-Powered Interview Assessment Platform

Conduct intelligent mock interviews with real-time voice interactions, AI-generated questions, automated candidate evaluation, and detailed performance feedback.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai)
![Google Gemini](https://img.shields.io/badge/Gemini-4285F4?style=for-the-badge&logo=google)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

</div>

---

## 📖 Overview

AI Interviewer is a full-stack AI-powered interview assessment platform designed to simulate realistic interview experiences through voice-based interactions. The platform leverages Large Language Models (LLMs), speech processing technologies, and real-time communication systems to generate dynamic interview questions, evaluate candidate responses, and provide automated feedback.

Built with scalability and production readiness in mind, the platform integrates modern web technologies, cloud services, AI APIs, and secure authentication mechanisms.

---

## ✨ Key Features

### 🤖 AI-Powered Interviewing

- Dynamic interview question generation
- Context-aware conversations
- Follow-up question generation
- Role-based interview customization
- Technical and behavioral interview support

### 🎤 Voice Interaction

- Speech-to-Text transcription
- Text-to-Speech interviewer responses
- Real-time voice communication
- Audio processing and recording

### 📊 Candidate Evaluation

- AI-driven answer assessment
- Automated feedback generation
- Performance analysis
- Interview session history

### ⚡ Real-Time Communication

- WebSocket-powered interactions
- Live interview sessions
- Low-latency response handling

### ☁️ Cloud Media Management

- Audio/video uploads
- Cloudinary integration
- AWS storage support
- Media processing with FFmpeg

### 🔒 Security & Authentication

- JWT Authentication
- Password encryption using bcrypt
- API rate limiting
- XSS protection
- Helmet security middleware

### 💳 Payment Support

- Razorpay integration
- Subscription workflows
- Payment processing support

---

## 🏗️ System Architecture

```text
┌───────────────────────────┐
│       Next.js Client      │
│   React + TypeScript UI   │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│      Express Backend      │
│     REST APIs + WS        │
└──────┬────────┬───────────┘
       │        │
       │        │
       ▼        ▼

 MongoDB     AI Services
 Database    Gemini/OpenAI

                 │
                 ▼

        Speech Processing
      Google STT/TTS
         Deepgram

                 │
                 ▼

         Media Storage
       AWS S3 / Cloudinary
```

---

## 🛠️ Tech Stack

### Frontend

| Technology | Purpose |
|------------|----------|
| Next.js 15 | Framework |
| React 18 | UI Development |
| TypeScript | Type Safety |
| Tailwind CSS | Styling |
| Radix UI | Accessible Components |
| Lucide React | Icons |
| Anime.js | Animations |

### Backend

| Technology | Purpose |
|------------|----------|
| Node.js | Runtime |
| Express.js | API Server |
| MongoDB | Database |
| Mongoose | ODM |
| JWT | Authentication |
| WebSockets | Real-Time Communication |

### AI & Speech

| Service | Purpose |
|----------|----------|
| Google Gemini | Question Generation |
| OpenAI | AI Evaluation |
| Deepgram | Speech Processing |
| Google STT | Speech Recognition |
| Google TTS | Voice Synthesis |

### Cloud Services

| Service | Purpose |
|----------|----------|
| AWS S3 | Media Storage |
| Cloudinary | Asset Management |
| FFmpeg | Media Processing |

---

## 📁 Folder Structure

```bash
AI_Interviewer
│
├── client
│   ├── app
│   ├── components
│   ├── hooks
│   ├── services
│   ├── lib
│   ├── types
│   └── public
│
├── server
│   ├── config
│   ├── controllers
│   ├── middleware
│   ├── models
│   ├── routes
│   ├── services
│   ├── utils
│   └── websocket
│
└── README.md
```

---

## ⚙️ Installation

### Clone Repository

```bash
git clone https://github.com/Yaswanthram-396/AI_Interviewer.git

cd AI_Interviewer
```

### Frontend Setup

```bash
cd client

npm install

npm run dev
```

### Backend Setup

```bash
cd server

npm install

npm run dev
```

---

## 🔑 Environment Variables

### Backend (.env)

```env
PORT=5000

MONGODB_URI=

JWT_SECRET=

OPENAI_API_KEY=

GEMINI_API_KEY=

DEEPGRAM_API_KEY=

GOOGLE_APPLICATION_CREDENTIALS=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_BUCKET_NAME=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## 🚀 Interview Workflow

```text
User Login
     │
     ▼
Select Interview Type
     │
     ▼
AI Generates Questions
     │
     ▼
Candidate Responds Via Voice
     │
     ▼
Speech-to-Text Conversion
     │
     ▼
AI Evaluation
     │
     ▼
Feedback Generation
     │
     ▼
Interview Completion
```

---

## 🎯 Supported Use Cases

- Technical Interview Practice
- HR Interview Simulation
- Campus Placement Preparation
- Candidate Screening
- Mock Interviews
- Communication Skill Evaluation
- Career Readiness Assessment

---

## 🔒 Security Features

✅ JWT Authentication

✅ bcrypt Password Hashing

✅ Helmet Middleware

✅ Rate Limiting

✅ Input Validation

✅ Secure Cookie Handling

✅ XSS Protection

---

## 📊 Core Capabilities

| Capability | Status |
|------------|---------|
| AI Question Generation | ✅ |
| Voice Interviews | ✅ |
| Speech-to-Text | ✅ |
| Text-to-Speech | ✅ |
| Candidate Evaluation | ✅ |
| Authentication | ✅ |
| WebSockets | ✅ |
| Cloud Storage | ✅ |
| Payment Integration | ✅ |
| Media Processing | ✅ |

---

## 🌟 Future Enhancements

- Resume-Based Interviews (RAG)
- ATS Resume Analysis
- Adaptive Interview Difficulty
- Coding Interview Environment
- Recruiter Dashboard
- AI Interview Reports
- Speech Analytics
- Behavioral Analysis
- Multi-Agent Evaluation Pipeline
- Candidate Ranking System

---


## 👨‍💻 Author

### Yaswanth Ram

GitHub:
https://github.com/Yaswanthram-396

LinkedIn:
Add Your LinkedIn Profile

Portfolio:
Add Your Portfolio Link

---

## ⭐ Project Highlights

- Full-Stack Development
- Generative AI Integration
- Real-Time Communication
- Speech Processing
- Cloud Storage Management
- Secure Authentication
- Scalable Backend Architecture
- Modern Next.js Ecosystem

---

## 💡 Advanced Feature Ideas & Implementation Roadmap

The following enhancements are planned to transform AI Interviewer into a complete AI-driven recruitment and assessment platform.

### 📄 Resume-Aware Interviews (RAG)

#### Problem
Traditional AI interviewers ask generic questions that are not personalized to a candidate's background.

#### Proposed Solution

1. Candidate uploads resume.
2. Resume is parsed and converted into embeddings.
3. Resume data is stored in a vector database.
4. Relevant skills and experiences are retrieved during the interview.
5. AI generates personalized follow-up questions.

#### Example

Resume:

```text
Skills:
- React
- Node.js
- MongoDB
```

Generated Questions:

```text
Explain React Reconciliation.

How would you optimize MongoDB queries?

Describe a backend project built with Node.js.
```

#### Tech Stack

- Gemini / OpenAI
- Pinecone
- ChromaDB
- LangChain

---

### 📊 ATS Resume Analysis

#### Problem

Candidates often don't know whether their resume matches industry standards.

#### Proposed Solution

- Extract skills from resume
- Compare against job description
- Generate ATS score
- Identify missing skills

#### Sample Output

```text
ATS Score: 82%

Strengths:
✓ React
✓ Node.js
✓ MongoDB

Missing:
✗ Docker
✗ AWS
✗ CI/CD
```

---

### 🎯 Adaptive Interview Difficulty

#### Problem

Most mock interviews follow a fixed question sequence.

#### Proposed Solution

The AI dynamically adjusts difficulty based on candidate performance.

```text
Easy Question
      ↓
Correct Answer
      ↓
Medium Question
      ↓
Correct Answer
      ↓
Hard Question
```

#### Benefits

- Personalized interview experience
- Better candidate evaluation
- More realistic interview simulation

---

### 🧠 Multi-Agent Interview Evaluation

#### Problem

Single-prompt evaluation often produces inconsistent feedback.

#### Proposed Solution

Separate AI agents evaluate different aspects.

```text
Question Generator Agent

Communication Agent

Technical Evaluation Agent

Behavioral Evaluation Agent

Report Generator Agent
```

#### Benefits

- Better scoring accuracy
- Explainable evaluations
- Modular architecture

---

### 🎤 Speech Analytics

#### Problem

Most interview platforms only evaluate content.

#### Proposed Solution

Analyze:

- Speaking speed
- Filler words
- Pauses
- Confidence indicators
- Fluency

#### Example

```text
Words Per Minute: 118

Filler Words:
- um (8)
- like (3)

Fluency Score: 8.2/10
```

---

### 👨‍💻 Coding Interview Environment

#### Problem

Technical interviews require hands-on coding evaluation.

#### Proposed Solution

- Monaco Editor
- Real-time code execution
- Hidden test cases
- AI code review

#### Supported Languages

- JavaScript
- TypeScript
- Python
- Java
- C++
- Go

#### Future Features

- DSA Challenges
- System Design Assessments
- Code Quality Scoring

---

### 📈 Recruiter Dashboard

#### Problem

Recruiters need centralized candidate assessment management.

#### Proposed Solution

Dashboard providing:

- Candidate rankings
- Interview reports
- Skill analytics
- Hiring recommendations
- Downloadable assessments

#### Sample Metrics

```text
Candidates Interviewed: 250

Average Score: 78%

Top Skill:
Backend Development

Most Common Weakness:
System Design
```

---

### 📑 AI Interview Reports

#### Problem

Candidates and recruiters need actionable feedback.

#### Proposed Solution

Generate detailed PDF reports.

#### Report Includes

- Overall Score
- Technical Score
- Communication Score
- Strengths
- Weaknesses
- Learning Recommendations

#### Example

```text
Overall Score: 8.4/10

Technical Skills: 9/10

Communication: 7.5/10

Recommended Topics:
- Docker
- System Design
- Database Optimization
```

---

### 🎥 Behavioral & Video Analysis

#### Problem

Interview success depends on more than technical knowledge.

#### Proposed Solution

Analyze:

- Eye contact
- Facial expressions
- Attention level
- Head movement
- Engagement score

#### Technologies

- MediaPipe
- OpenCV
- TensorFlow.js

---

### 🛡️ Anti-Cheating System

#### Problem

Online assessments are vulnerable to unfair practices.

#### Proposed Solution

Monitor:

- Tab switching
- Multiple face detection
- Copy-paste events
- Camera presence
- Suspicious activity patterns

#### Benefits

- Fair assessments
- Recruiter trust
- Higher evaluation quality

---

### 🎓 Personalized Learning Roadmaps

#### Problem

Candidates often receive scores without guidance.

#### Proposed Solution

Generate customized learning paths.

#### Example

```text
Weak Areas:
- Database Indexing
- Operating Systems

Recommended Resources:
1. Database Internals
2. OS Concepts
3. System Design Primer

Estimated Improvement Time:
4 Weeks
```

## 🚀 Vision

The long-term vision of AI Interviewer is to become a complete AI-powered hiring ecosystem capable of:

- Conducting intelligent interviews
- Evaluating technical and communication skills
- Providing recruiter insights
- Delivering personalized learning recommendations
- Automating large-scale candidate screening

while maintaining a seamless and engaging interview experience.

<div align="center">

### ⭐ If you found this project useful, consider giving it a star!

Built with ❤️ using Next.js, Node.js, MongoDB, OpenAI, Gemini, and Deepgram.

</div>
