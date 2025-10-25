"use client";
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Download, Printer, Home, TrendingUp, Award, AlertCircle, CheckCircle2, XCircle, Clock, User } from "lucide-react";

// Define TypeScript interfaces for the API response
interface Result {
  skill: string;
  rating: string;
  conclusion: string;
}

interface Analysis {
  performance: string;
  strengths: string[];
  weaknesses: string[];
  results: Result[];
}

interface InterviewDetails {
  title: string;
  description: string;
  difficulty: string;
}

interface ApiResponse {
  interviewDetails: InterviewDetails;
  analysis: Analysis;
}

// Gradient progress bar component
const RatingBar: React.FC<{ rating: string }> = ({ rating }) => {
  const [score, maxScore] = rating.split("/").map((n) => parseInt(n.trim(), 10) || 0);
  const percentage = useMemo(() => (score / maxScore) * 100, [score, maxScore]);
  const color = percentage >= 80 ? "from-green-500 to-emerald-500" : percentage >= 60 ? "from-yellow-500 to-orange-500" : "from-red-500 to-rose-500";

  return (
    <div className="flex items-center space-x-3 w-full">
      <span className="font-bold text-gray-800 w-12 text-right">{rating}</span>
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
        <div
          className={`h-3 rounded-full bg-gradient-to-r ${color} transition-all duration-1000 ease-out shadow-md`}
          style={{ width: `${percentage}%` }}
          aria-valuenow={score}
          aria-valuemax={maxScore}
          role="progressbar"
        ></div>
      </div>
      <span className="text-sm font-semibold text-gray-600 w-12">{percentage.toFixed(0)}%</span>
    </div>
  );
};

// Main component
const InterviewReportPage: React.FC = () => {
  const { sessionid } = useParams();
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let attempt = 0;
    const MAX_RETRIES = 5;
    const apiUrl = `http://localhost:5000/api/interviews/submit-answers?sessionId=${sessionid}`;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      while (attempt < MAX_RETRIES) {
        try {
          const response = await axios.post<ApiResponse>(apiUrl, {});
          setData(response.data);
          setIsLoading(false);
          return;
        } catch (err: any) {
          attempt++;
          console.error(`Attempt ${attempt} failed:`, err);
          if (attempt >= MAX_RETRIES) {
            setError(err.response?.data?.error || "Failed to load interview analysis after multiple retries.");
            setIsLoading(false);
          } else {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    };

    fetchData();
  }, [sessionid]);

  // Calculate overall score
  const overallScore = useMemo(() => {
    if (!data?.analysis?.results) return 0;
    const totalScore = data.analysis.results.reduce((acc, result) => {
      const [score, max] = result.rating.split("/").map(n => parseInt(n.trim(), 10) || 0);
      return acc + (score / max) * 100;
    }, 0);
    return Math.round(totalScore / data.analysis.results.length);
  }, [data]);

  // Prepare data for charts
  const radarData = useMemo(() => {
    if (!data?.analysis?.results) return [];
    return data.analysis.results.map(result => {
      const [score, max] = result.rating.split("/").map(n => parseInt(n.trim(), 10) || 0);
      return {
        skill: result.skill.length > 15 ? result.skill.substring(0, 15) + '...' : result.skill,
        fullSkill: result.skill,
        score: (score / max) * 100,
      };
    });
  }, [data]);

  const pieData = useMemo(() => {
    if (!data?.analysis?.results) return [];
    return data.analysis.results.map(result => {
      const [score] = result.rating.split("/").map(n => parseInt(n.trim(), 10) || 0);
      return {
        name: result.skill,
        value: score,
      };
    });
  }, [data]);

  const barData = useMemo(() => {
    if (!data?.analysis?.results) return [];
    return data.analysis.results.map(result => {
      const [score, max] = result.rating.split("/").map(n => parseInt(n.trim(), 10) || 0);
      return {
        skill: result.skill.length > 20 ? result.skill.substring(0, 20) + '...' : result.skill,
        score: score,
        percentage: (score / max) * 100,
      };
    });
  }, [data]);

  const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444'];

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const reportData = JSON.stringify(data, null, 2);
    const blob = new Blob([reportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${sessionid}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-red-100">
        <div className="text-center p-8 bg-white rounded-2xl shadow-2xl border-t-4 border-red-500 max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-red-600 mb-3">Error Loading Report</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2 mx-auto"
          >
            <Home className="w-5 h-5" />
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="relative">
            <div className="w-24 h-24 border-8 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
            <Clock className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Analyzing Interview Performance</h2>
          <p className="text-gray-600">AI is generating your comprehensive report...</p>
          <div className="mt-6 flex justify-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  const { interviewDetails, analysis } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 sm:p-8 print:bg-white">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-2xl p-8 mb-8 text-white print:bg-blue-600">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <h1 className="text-4xl font-extrabold mb-2 flex items-center">
                <Award className="w-10 h-10 mr-3" />
                Interview Performance Report
              </h1>
              <p className="text-xl text-blue-100 mb-4">
                <span className="font-semibold">{interviewDetails.title}</span> - Comprehensive Assessment
              </p>
              <div className="flex items-center space-x-4 text-sm text-blue-100">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span>Candidate ID: {String(sessionid).substring(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4" />
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            {/* Actions - Hide on print */}
            <div className="flex space-x-3 print:hidden">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg flex items-center space-x-2 transition-all"
              >
                <Printer className="w-5 h-5" />
                <span>Print</span>
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg flex items-center space-x-2 transition-all"
              >
                <Download className="w-5 h-5" />
                <span>Download</span>
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg flex items-center space-x-2 transition-all"
              >
                <Home className="w-5 h-5" />
                <span>Home</span>
              </button>
            </div>
          </div>

          {/* Overall Score Badge */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-100 mb-1">Overall Performance Score</p>
                <div className="flex items-baseline space-x-2">
                  <span className="text-6xl font-extrabold">{overallScore}%</span>
                  <TrendingUp className="w-8 h-8 text-green-300" />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-blue-100 mb-1">Assessment Level</p>
                <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
                  overallScore >= 80 ? 'bg-green-500' : overallScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                } text-white`}>
                  {overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Good' : 'Needs Improvement'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Job Details Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-indigo-500">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
                <Award className="w-6 h-6 text-indigo-600" />
              </div>
              Position Details
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 mb-1">Job Role</p>
                <p className="font-semibold text-gray-900">{interviewDetails.title}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Difficulty Level</p>
                <span className="inline-block px-3 py-1 text-sm font-semibold rounded-full bg-indigo-100 text-indigo-800">
                  {interviewDetails.difficulty}
                </span>
              </div>
              <details className="text-gray-600 text-sm cursor-pointer mt-4 pt-4 border-t border-gray-200">
                <summary className="font-semibold text-gray-700 hover:text-indigo-600 transition-colors">
                  View Full Description
                </summary>
                <div className="mt-3 text-gray-600 max-h-48 overflow-y-auto">
                  {interviewDetails.description.split("\n").map((line, index) => (
                    <p key={index} className="mb-1">{line}</p>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {/* Performance Summary Card */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-6 border-t-4 border-emerald-500">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mr-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              Overall Assessment
            </h2>
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg p-6 border-l-4 border-emerald-500">
              <p className="text-gray-700 leading-relaxed text-lg italic">
                &ldquo;{analysis.performance}&rdquo;
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <span className={`inline-flex items-center px-6 py-2 text-sm font-bold rounded-full shadow-lg ${
                overallScore >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white' :
                overallScore >= 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-600 text-white' :
                'bg-gradient-to-r from-red-500 to-rose-600 text-white'
              }`}>
                <Award className="w-4 h-4 mr-2" />
                {overallScore >= 80 ? 'Strong Candidate - Recommended' :
                 overallScore >= 60 ? 'Promising Candidate - Consider' :
                 'Needs Development - Follow-up Required'}
              </span>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8 print:hidden">
          {/* Radar Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Skills Overview</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#E5E7EB" />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar name="Performance" dataKey="score" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Score Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name.substring(0, 15)}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart - Full Width */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 print:hidden">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Performance Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="skill" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 5]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="score" fill="#3B82F6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Strengths and Weaknesses */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Strengths */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-green-500">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center text-green-700">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              Key Strengths
            </h2>
            <ul className="space-y-3">
              {analysis.strengths.map((strength, index) => (
                <li key={index} className="flex items-start bg-green-50 p-3 rounded-lg transition-all hover:shadow-md">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-gray-700 font-medium">{strength}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Weaknesses */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-amber-500">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center text-amber-700">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mr-3">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              Areas for Development
            </h2>
            <ul className="space-y-3">
              {analysis.weaknesses.map((weakness, index) => (
                <li key={index} className="flex items-start bg-amber-50 p-3 rounded-lg transition-all hover:shadow-md">
                  <div className="flex-shrink-0 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <AlertCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-gray-700">{weakness}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Detailed Skill Ratings */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-purple-500">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center text-purple-700">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            Detailed Skill Assessment
          </h2>

          <div className="space-y-6">
            {analysis.results.map((result, index) => (
              <div 
                key={index} 
                className="border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-all bg-gradient-to-r from-gray-50 to-white"
              >
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center">
                      <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold mr-3">
                        {index + 1}
                      </span>
                      {result.skill}
                    </h3>
                  </div>
                  <RatingBar rating={result.rating} />
                  <p className="text-sm text-gray-600 italic pl-11 pt-2 border-l-2 border-purple-200 ml-4">
                    {result.conclusion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-500 text-sm pb-8">
          <p>This report was generated on {new Date().toLocaleString()}</p>
          <p className="mt-1">Interview Session ID: {String(sessionid)}</p>
          <p className="mt-4 text-xs">© 2024 EarlyJobs AI Interview System - Confidential</p>
        </div>
      </div>
    </div>
  );
};

export default InterviewReportPage;
