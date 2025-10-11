"use client";
import { useRouter } from "next/navigation"; 
import React, { useEffect, useState } from "react";

interface Interview {
  _id: string;
  title: string;
  description: string;
  difficulty: string;
  createdDate: string;
}

const Interviews = () => {
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInterviews = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/interviews");
        const data = await res.json();
        if (data.success) {
          setInterviews(data.interviews);
        }
      } catch (error) {
        console.error("Error fetching interviews:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInterviews();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen text-lg font-semibold text-gray-700">
        Loading interviews...
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-indigo-600">
        Available Interviews
      </h1>

      {interviews.length === 0 ? (
        <p className="text-center text-gray-500 text-lg">
          No interviews found.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {interviews.map((interview) => (
            <div
              key={interview._id}
              className="bg-white shadow-lg rounded-xl p-5 border border-gray-200 hover:shadow-xl transition duration-300"
            >
              <h2 className="text-xl font-semibold text-gray-800 mb-1">
                {interview.title}
              </h2>
              <p className="text-sm text-gray-500 mb-2">
                📅 {new Date(interview.createdDate).toLocaleDateString()}
              </p>
              <span className="inline-block px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full mb-3">
                {interview.difficulty}
              </span>
              <p className="text-gray-700 text-sm h-16 line-clamp-2">
                {interview.description}
              </p>
              <button className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition" onClick={() =>router.push(`/interviews/${interview._id}`) }>
                Start Interview
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Interviews;
